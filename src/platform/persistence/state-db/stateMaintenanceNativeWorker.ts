import { isDirectCliEntrypoint } from '../../../shared/cliEntrypoint.js';
import { checkDatabaseFile, openStateDatabase, snapshotDatabaseFile } from './stateDatabase.js';
import type { StateMaintenanceJob } from './stateMaintenance.js';

if (isDirectCliEntrypoint(import.meta.url, process.argv[1])) {
  process.on('disconnect', () => process.exit(1));
  process.once('message', (input: unknown) => {
    let response: { ok: boolean; code?: string };
    try {
      const job = input as StateMaintenanceJob;
      if (!job || !['check', 'snapshot'].includes(job.kind) || typeof job.file !== 'string'
        || job.kind === 'snapshot' && typeof job.target !== 'string') throw Error('Invalid maintenance job');
      const database = openStateDatabase({ file: job.file, mode: 'reader' });
      database.close();
      if (checkDatabaseFile(job.file).length) response = { ok: false, code: 'integrity_check_failed' };
      else {
        if (job.kind === 'snapshot') {
          snapshotDatabaseFile(job.file, job.target);
          if (checkDatabaseFile(job.target).length) throw Error('Snapshot did not verify');
        }
        response = { ok: true };
      }
    } catch { response = { ok: false, code: 'worker_failed' }; }
    process.send?.(response, () => process.exit(response.ok ? 0 : 1));
  });
}
