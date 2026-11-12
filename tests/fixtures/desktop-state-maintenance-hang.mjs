import { openSync, writeFileSync } from 'node:fs';
process.once('message', job => {
  openSync(job.file, 'r'); // Deliberately held until OS process termination.
  writeFileSync(`${job.file}.worker-pid`, String(process.pid));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
});
