import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

// The module is trusted evaluator code frozen by the operator, never candidate code.
const controller = new AbortController();
parentPort.on('message', (message) => { if (message === 'abort') controller.abort(); });
try {
  const evaluator = await import(pathToFileURL(workerData.modulePath).href);
  if (typeof evaluator.attempt !== 'function') throw new Error('Missing evaluator entry.');
  const result = await evaluator.attempt({ ...workerData.input, signal: controller.signal });
  parentPort.postMessage({ result });
} catch {
  parentPort.postMessage({ error: 'evaluator_error' });
} finally { parentPort.close(); }
