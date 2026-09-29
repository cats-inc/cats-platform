// Host-owned worker, isolated from the Platform process and coupled to its IPC lifetime.
import ngrok from '@ngrok/ngrok';

export async function start(context) {
  const { authtoken, target, url } = context.ingress;
  const listener = await ngrok.forward({ addr: target, authtoken, force_new_session: true,
    schemes: ['https'], ...(url ? { domain: new URL(url).hostname } : {}) });
  return { publicUrl: listener.url(), close: () => listener.close() };
}
