// Isolated concurrency/crash fixture. Usage: node <script> <temporary-profile> <count|hold>.
import { readFile } from 'node:fs/promises';
import { withProfileLock } from '../../build/server/platform/persistence/state-db/profileLock.js';
import { writeDurableFile } from '../../build/server/platform/persistence/state-db/atomicFile.js';

const [profile, command] = process.argv.slice(2);
if (!profile) throw new Error('Fixture needs an explicit temporary path');
if (command === 'hold-reclaimer') {
  await withProfileLock(profile, async () => {}, {
    checkpoint: async stage => {
      if (stage !== 'reclaim_claimed') return;
      console.log('ready');
      await new Promise(() => { setInterval(() => {}, 10_000); });
    },
  });
} else if (command === 'hold') {
  await withProfileLock(profile, async () => {
    console.log('ready');
    await new Promise(() => { setInterval(() => {}, 10_000); });
  });
} else {
  const count = Number(command);
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new Error('Invalid fixture count');
  for (let index = 0; index < count; index++) {
    await withProfileLock(profile, async () => {
      const current = Number(await readFile(profile, 'utf8'));
      await new Promise(done => setTimeout(done, 2));
      await writeDurableFile(profile, String(current + 1));
    });
  }
}
