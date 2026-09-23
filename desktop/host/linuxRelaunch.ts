import { spawn, type ChildProcess } from 'node:child_process';
import { Socket } from 'node:net';

// Electron 41's native relaunch helper adds NoNewPrivs before launching the
// replacement host. That host then cannot use pkexec for its next .deb update.
// A Node child inherits the existing restriction unchanged (including NNP=1).
// Keep stdin open until host shutdown releases it, after Electron has released
// its single-instance lock. EOF is the shutdown barrier, not a guessed delay.
const RELAUNCH_HELPER = `
const { spawn } = require('node:child_process');
const [executable, args] = JSON.parse(process.argv[1]);
delete process.env.ELECTRON_RUN_AS_NODE;
process.stdin.resume();
process.stdin.once('end', () => {
  const child = spawn(executable, args, { detached: true, stdio: 'ignore' });
  child.once('error', (error) => {
    console.error('[desktop-relaunch] replacement launch failed:', error.message);
    process.exitCode = 1;
  });
  child.unref();
});
`;

export interface LinuxDesktopRelaunchOptions {
  executable: string;
  args: string[];
  logger: (message: string) => void;
}

/** Schedule one replacement after this host exits, without adding privileges. */
export function createLinuxDesktopRelaunch(
  options: LinuxDesktopRelaunchOptions,
): () => void {
  let pendingHelper: ChildProcess | null = null;
  return () => {
    if (pendingHelper) {
      return;
    }
    const helper = spawn(options.executable, [
      '-e', RELAUNCH_HELPER, '--', JSON.stringify([options.executable, options.args]),
    ], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      detached: true,
      stdio: ['pipe', 'ignore', 'inherit'],
    });
    pendingHelper = helper;
    helper.once('error', (error) => {
      pendingHelper = null;
      options.logger(`[desktop-relaunch] helper launch failed: ${error.message}`);
    });
    helper.once('exit', (code, signal) => {
      pendingHelper = null;
      if (code !== 0) {
        options.logger(`[desktop-relaunch] helper exited: code=${code}, signal=${signal}`);
      }
    });
    // Do not end/destroy stdin: only host termination should release the child.
    if (helper.stdin instanceof Socket) {
      helper.stdin.unref();
    }
    helper.unref();
  };
}
