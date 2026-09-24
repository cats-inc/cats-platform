/** An HTTP responder alone cannot prove ownership of a disposable Runtime. */
export function waitForCandidateRuntimeReady(child, {
  host = '127.0.0.1', port, managedBy = 'plan110-k4', timeoutMs = 30_000,
}) {
  return new Promise((resolve, reject) => {
    let pending = '';
    let discardingLine = false;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error); else resolve(value);
    };
    const onError = () => finish(new Error('Candidate Runtime failed before owned readiness'));
    const onExit = () => finish(new Error('Candidate Runtime exited before owned readiness'));
    const onData = (chunk) => {
      for (const part of chunk.toString().split(/(?<=\n)/u)) {
        if (!discardingLine) {
          pending += part;
          if (pending.length > 16_384) { pending = ''; discardingLine = true; }
        }
        if (!part.endsWith('\n')) continue;
        const line = pending.trim();
        pending = '';
        if (discardingLine) { discardingLine = false; continue; }
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event?.event !== 'runtime.ready' || event.service !== 'cats-runtime'
          || event.contractVersion !== 1 || event.mode !== 'app-managed' || event.managedBy !== managedBy
          || event.phase !== 'ready' || event.ready !== true || event.host !== host || event.port !== port
          || !Number.isInteger(child.pid) || event.pid !== child.pid) continue;
        if (child.exitCode !== null || child.signalCode !== null) { onExit(); return; }
        finish(null, event);
        return;
      }
    };
    const timer = setTimeout(() => finish(new Error('Candidate Runtime did not report owned readiness')), timeoutMs);
    child.stdout.on('data', onData);
    child.on('error', onError);
    child.on('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) onExit();
  });
}
