import { execFile, spawn } from 'node:child_process';
import { accessSync, chmodSync, constants, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

/**
 * SPEC-136 FR-24: sign-in needs a real terminal, so this opens one with a fixed command per
 * provider. No text from a page or a model reaches it: the command comes from this table and
 * the page only names a provider. Ported from Cats Bot's setupTerminal.ts, with Cats' tools.
 *
 * Only commands backed by Cats Bot's table or Runtime's own auth hints are listed. A provider
 * not listed gets its hint and documentation link, not a guessed command.
 */
const SIGN_IN: Readonly<Record<string, string>> = {
  claude: 'claude',
  codex: 'codex login',
  antigravity: 'agy',
  grok: 'grok login',
  muse: 'muse login',
  kilo: 'kilo auth',
  goose: 'goose configure',
  cline: 'cline auth',
  devin: 'devin auth login',
};

export function signInCommand(provider: unknown): string | null {
  return typeof provider === 'string' && Object.hasOwn(SIGN_IN, provider) ? SIGN_IN[provider]! : null;
}

export function signInCommands(): Record<string, string> {
  return { ...SIGN_IN };
}

export interface TerminalInvocation {
  command: string;
  args: string[];
  /** A script to write first, whose path replaces `{script}` in `args`. */
  script?: string;
}

/** Terminals on Linux, in the order tried, with how each takes one program to run. */
const LINUX_TERMINALS: ReadonlyArray<[string, string[]]> = [
  ['x-terminal-emulator', ['-e', '{script}']],
  ['gnome-terminal', ['--', '{script}']],
  ['konsole', ['-e', '{script}']],
  ['xfce4-terminal', ['-x', '{script}']],
  ['kitty', ['{script}']],
  ['alacritty', ['-e', '{script}']],
  ['xterm', ['-e', '{script}']],
];

const EARLY_EXIT_MS = 400;

function quoted(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function isOnPath(program: string, env: NodeJS.ProcessEnv): boolean {
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    try {
      accessSync(join(directory, program), constants.X_OK);
      return true;
    } catch { /* Not in this folder. */ }
  }
  return false;
}

/**
 * A script for macOS and Linux: a GUI launch has no login-shell PATH, so it carries the app's.
 * It leaves a shell open so the person can read the result.
 */
export function signInScript(command: string, path: string): string {
  return `#!/bin/sh\nrm -f -- "$0"\nexport PATH=${quoted(path)}\n${command}\nexec "\${SHELL:-/bin/sh}"\n`;
}

/** How to open a terminal on this OS, or null when none is known to be installed. */
export function terminalInvocation(
  platform: NodeJS.Platform,
  command: string,
  env: NodeJS.ProcessEnv,
  isInstalled: (program: string) => boolean = (program) => isOnPath(program, env),
): TerminalInvocation | null {
  const path = env.PATH ?? env.Path ?? '';
  if (platform === 'win32') {
    // `start` opens a window of its own. Its first QUOTED argument is the window's title. Node
    // quotes only arguments with a space, so the title needs one, or `start` takes it for the
    // program. It looks in the current folder first, so it gets the full path where there is one.
    // Command Prompt runs npm's .cmd shims, so this needs no PowerShell policy.
    const shell = env.ComSpec || 'cmd.exe';
    return { command: shell, args: ['/c', 'start', 'Cats Setup', shell, '/k', command] };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', 'Terminal', '{script}'], script: signInScript(command, path) };
  }
  if (platform === 'linux') {
    const found = LINUX_TERMINALS.find(([program]) => isInstalled(program));
    return found ? { command: found[0], args: [...found[1]], script: signInScript(command, path) } : null;
  }
  return null;
}

function writeScript(script: string, platform: NodeJS.Platform): string {
  const directory = mkdtempSync(join(tmpdir(), 'cats-sign-in-'));
  // Terminal.app runs a file it is given only under this extension.
  const file = join(directory, platform === 'darwin' ? 'sign-in.command' : 'sign-in.sh');
  writeFileSync(file, script, { mode: 0o700 });
  chmodSync(file, 0o700);
  return file;
}

/**
 * The host's own PATH predates an install it just ran, so Windows reads the saved value. A person
 * who just installed a tool can then sign in without restarting Cats. Best effort: if this cannot
 * be read, the terminal gets the host's PATH, and FR-24's note covers the rest.
 */
export async function freshWindowsEnv(env: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  try {
    const { stdout } = await promisify(execFile)('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')",
    ], { windowsHide: true, timeout: 5_000, encoding: 'utf8' });
    const saved = stdout.trim();
    if (!saved) return env;
    const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') ?? 'PATH';
    return { ...env, [key]: `${saved};${env[key] ?? ''}` };
  } catch {
    return env;
  }
}

export interface OpenTerminalResult {
  opened: boolean;
  command: string | null;
}

/** Opens the terminal. False when none could be opened, so the page offers the command to copy. */
export async function openSignInTerminal(
  provider: unknown,
  options: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    launch?: typeof spawn;
    freshEnv?: (env: NodeJS.ProcessEnv) => Promise<NodeJS.ProcessEnv>;
  } = {},
): Promise<OpenTerminalResult> {
  const command = signInCommand(provider);
  if (!command) return { opened: false, command: null };
  const platform = options.platform ?? process.platform;
  const baseEnv = options.env ?? process.env;
  const env = platform === 'win32' ? await (options.freshEnv ?? freshWindowsEnv)(baseEnv) : baseEnv;
  const launch = options.launch ?? spawn;
  const invocation = terminalInvocation(platform, command, env);
  if (!invocation) return { opened: false, command };
  return await new Promise((resolve) => {
    try {
      const script = invocation.script ? writeScript(invocation.script, platform) : '';
      const args = invocation.args.map((arg) => (arg === '{script}' ? script : arg));
      const child = launch(invocation.command, args, {
        detached: true, stdio: 'ignore', env, cwd: homedir(), windowsHide: false,
      });
      child.once('error', () => resolve({ opened: false, command }));
      // A launcher with no display to open on starts, then exits with an error right away.
      child.once('exit', (code) => resolve({ opened: code === 0, command }));
      child.once('spawn', () => {
        child.unref();
        setTimeout(() => resolve({ opened: true, command }), EARLY_EXIT_MS);
      });
    } catch {
      resolve({ opened: false, command });
    }
  });
}
