import { runStateMaintenance } from '../../build/server/platform/persistence/state-db/stateMaintenance.js';
await runStateMaintenance({ kind: 'check', file: process.argv[2] }, {
  timeoutMs: 10_000, worker: new URL('./desktop-state-maintenance-hang.mjs', import.meta.url),
});
