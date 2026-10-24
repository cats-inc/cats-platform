// Host-owned worker, isolated from the Platform process and coupled to its IPC lifetime.
import ngrok from '@ngrok/ngrok';
import { createServer } from 'node:net';

export async function start(context, { forward = options => ngrok.forward(options) } = {}) {
  const { authtoken, url } = context.ingress;
  let closing = false;
  let established = false;
  let closedDuringConnect = false;
  let pendingHandovers = 0;
  let backpressure = 0;
  const waiting = [];
  const rejectSocket = socket => {
    socket.setTimeout(1000, () => socket.destroy());
    socket.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    socket.resume();
  };
  const drain = () => {
    while (waiting.length && !backpressure) {
      const socket = waiting.shift();
      if (closing || !process.connected) { rejectSocket(socket); continue; }
      pendingHandovers++;
      let blocked = false;
      try {
        const sent = process.send({ type: 'ingress-socket' }, socket, { keepOpen: false }, error => {
          pendingHandovers--; if (blocked) backpressure--;
          if (error) socket.destroy();
          drain();
        });
        if (!sent) { blocked = true; backpressure++; }
      } catch { pendingHandovers--; socket.destroy(); }
    }
  };
  // The forwarder and its target port share a process lifetime. No stale tunnel
  // can reach a different service after the Platform process dies and releases ports.
  const server = createServer({ pauseOnConnect: true }, socket => {
    socket.on('error', () => socket.destroy());
    if (closing || !process.connected || pendingHandovers + waiting.length >= 64) { rejectSocket(socket); return; }
    socket.pause();
    waiting.push(socket); drain();
  });
  server.maxConnections = 64;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  const listener = await forward({ addr: `http://127.0.0.1:${port}`, authtoken,
    authtoken_from_env: false, force_new_session: true,
    schemes: ['https'], ...(url ? { domain: new URL(url).hostname } : {}),
    onStatusChange: status => {
      if (status === 'closed' && !closing) {
        if (established) process.exit(1);
        else closedDuringConnect = true;
      }
    },
  });
  if (closedDuringConnect) throw new Error('Provider closed during connection.');
  established = true;
  context.ingress.authtoken = '';
  return { publicUrl: listener.url(), port, close: async () => {
    closing = true;
    for (const socket of waiting.splice(0)) rejectSocket(socket);
    await listener.close(); // Keep the target bound if SDK cleanup fails; the runner then exits both together.
    await new Promise(resolve => server.close(resolve));
  } };
}
