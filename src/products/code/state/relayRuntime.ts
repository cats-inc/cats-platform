import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type {
  CodeRelayConnectorContract,
  CodeRelayDispatchRequest,
  CodeRelayDispatchResult,
  CodeRelayRosterEntry,
  CodeRelayRuntime,
} from './relayContracts.js';

interface CompletedProcess {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface LaunchSpec {
  command: string;
  prefixArgs: string[];
}

function createContract(): CodeRelayConnectorContract {
  return {
    version: 'phase0-local-cli-v1',
    transport: 'local_cli_subprocess',
    supportedProviders: ['codex', 'claude', 'gemini'],
    notes: [
      'Codex uses output-file capture for the final message.',
      'Claude uses --print JSON output.',
      'Gemini currently returns plain text only in the first slice.',
    ],
  };
}

const launchSpecCache = new Map<string, Promise<LaunchSpec>>();
const availabilityCache = new Map<string, { available: boolean; expiresAt: number }>();
const AVAILABILITY_CACHE_TTL_MS = 30_000;

function preferredWindowsCommandPath(paths: string[]): string | null {
  return paths.find((value) => value.toLowerCase().endsWith('.exe'))
    ?? paths.find((value) => value.toLowerCase().endsWith('.cmd'))
    ?? paths.find((value) => value.toLowerCase().endsWith('.bat'))
    ?? paths[0]
    ?? null;
}

async function resolveLaunchSpec(commandName: string): Promise<LaunchSpec> {
  const cached = launchSpecCache.get(commandName);
  if (cached) {
    return cached;
  }

  const promise = (async (): Promise<LaunchSpec> => {
    if (process.platform !== 'win32') {
      return {
        command: commandName,
        prefixArgs: [],
      };
    }

    const result = await runProcess('where.exe', [commandName], {
      cwd: process.cwd(),
      timeoutMs: 15_000,
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Unable to resolve ${commandName} on PATH.`);
    }

    const matches = result.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const resolvedPath = preferredWindowsCommandPath(matches);
    if (!resolvedPath) {
      throw new Error(`Unable to resolve ${commandName} on PATH.`);
    }

    if (resolvedPath.toLowerCase().endsWith('.exe')) {
      return {
        command: resolvedPath,
        prefixArgs: [],
      };
    }

    if (resolvedPath.toLowerCase().endsWith('.cmd') || resolvedPath.toLowerCase().endsWith('.bat')) {
      const wrapper = await readFile(resolvedPath, 'utf8');
      const scriptMatch = wrapper.match(/"%dp0%\\([^"]+\.js)"/iu);
      if (!scriptMatch?.[1]) {
        throw new Error(`Unable to resolve ${commandName} Node entry from ${resolvedPath}.`);
      }

      const scriptPath = path.join(
        path.dirname(resolvedPath),
        scriptMatch[1].replace(/\\/gu, path.sep),
      );
      return {
        command: process.execPath,
        prefixArgs: [scriptPath],
      };
    }

    return {
      command: resolvedPath,
      prefixArgs: [],
    };
  })();

  launchSpecCache.set(commandName, promise);
  return promise;
}

async function canResolveCommand(command: string): Promise<boolean> {
  const cached = availabilityCache.get(command);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.available;
  }

  try {
    await resolveLaunchSpec(command);
    availabilityCache.set(command, {
      available: true,
      expiresAt: Date.now() + AVAILABILITY_CACHE_TTL_MS,
    });
    return true;
  } catch {
    availabilityCache.set(command, {
      available: false,
      expiresAt: Date.now() + AVAILABILITY_CACHE_TTL_MS,
    });
    return false;
  }
}

function truncateOutput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length > 500 ? `${trimmed.slice(0, 497)}...` : trimmed;
}

function resolveDispatchCwd(repoPath: string | null): string {
  if (!repoPath) {
    return process.cwd();
  }

  return repoPath;
}

async function runProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeoutMs: number;
  },
): Promise<CompletedProcess> {
  return new Promise<CompletedProcess>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error(`${command} timed out after ${options.timeoutMs} ms.`));
      }
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.on('close', (exitCode) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode: exitCode ?? 1,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      }
    });
  });
}

async function dispatchWithCodex(
  request: CodeRelayDispatchRequest,
): Promise<CodeRelayDispatchResult> {
  const outputFile = path.join(
    os.tmpdir(),
    `cats-code-codex-${randomUUID()}.txt`,
  );
  const launch = await resolveLaunchSpec('codex');
  const args = [
    ...launch.prefixArgs,
    'exec',
    '--skip-git-repo-check',
    '-s',
    'read-only',
    '--color',
    'never',
    '-C',
    resolveDispatchCwd(request.repoPath),
    '-o',
    outputFile,
  ];

  if (request.entry.model) {
    args.push('--model', request.entry.model);
  }

  args.push(request.prompt);
  const result = await runProcess(launch.command, args, {
    cwd: resolveDispatchCwd(request.repoPath),
    timeoutMs: 120_000,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'Codex execution failed.');
  }

  let content = '';
  try {
    content = (await readFile(outputFile, 'utf8')).trim();
  } finally {
    await rm(outputFile, { force: true });
  }

  return {
    entryId: request.entry.id,
    content: content || result.stdout.trim(),
    stdoutExcerpt: truncateOutput(result.stdout),
    stderrExcerpt: truncateOutput(result.stderr),
  };
}

async function dispatchWithClaude(
  request: CodeRelayDispatchRequest,
): Promise<CodeRelayDispatchResult> {
  const launch = await resolveLaunchSpec('claude');
  const args = [...launch.prefixArgs, '-p', '--output-format', 'json'];
  if (request.entry.model) {
    args.push('--model', request.entry.model);
  }
  args.push('--', request.prompt);

  const result = await runProcess(launch.command, args, {
    cwd: resolveDispatchCwd(request.repoPath),
    timeoutMs: 120_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'Claude execution failed.');
  }

  let content = result.stdout.trim();
  try {
    const payload = JSON.parse(result.stdout) as {
      result?: unknown;
    };
    if (typeof payload.result === 'string' && payload.result.trim()) {
      content = payload.result.trim();
    }
  } catch {
    // Keep stdout fallback; Claude can still return text in some environments.
  }

  return {
    entryId: request.entry.id,
    content,
    stdoutExcerpt: truncateOutput(result.stdout),
    stderrExcerpt: truncateOutput(result.stderr),
  };
}

function normalizeGeminiContent(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .filter((line) => line !== 'Loaded cached credentials.');
  return lines.join('\n').trim();
}

async function dispatchWithGemini(
  request: CodeRelayDispatchRequest,
): Promise<CodeRelayDispatchResult> {
  const launch = await resolveLaunchSpec('gemini');
  const args = [...launch.prefixArgs, '--prompt', request.prompt];
  const result = await runProcess(launch.command, args, {
    cwd: resolveDispatchCwd(request.repoPath),
    timeoutMs: 120_000,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'Gemini execution failed.');
  }

  return {
    entryId: request.entry.id,
    content: normalizeGeminiContent(result.stdout),
    stdoutExcerpt: truncateOutput(result.stdout),
    stderrExcerpt: truncateOutput(result.stderr),
  };
}

export function createLocalCliCodeRelayRuntime(): CodeRelayRuntime {
  return {
    describeContract(): CodeRelayConnectorContract {
      return createContract();
    },

    async probeRosterEntries(entries: CodeRelayRosterEntry[]): Promise<CodeRelayRosterEntry[]> {
      return Promise.all(entries.map(async (entry) => {
        const available = await canResolveCommand(entry.provider);
        return {
          ...entry,
          availability: available ? 'available' : 'unavailable',
          availabilitySummary: available
            ? `Local ${entry.label} CLI detected.`
            : `Local ${entry.label} CLI not found on PATH.`,
        };
      }));
    },

    async dispatch(request: CodeRelayDispatchRequest): Promise<CodeRelayDispatchResult> {
      switch (request.entry.provider) {
        case 'codex':
          return dispatchWithCodex(request);
        case 'claude':
          return dispatchWithClaude(request);
        case 'gemini':
          return dispatchWithGemini(request);
        default:
          throw new Error(`Unsupported relay provider: ${request.entry.provider}`);
      }
    },
  };
}
