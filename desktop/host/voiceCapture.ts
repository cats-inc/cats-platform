import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { BrowserWindow } from 'electron';

import type { DesktopHostConfig } from './config.js';
import {
  DESKTOP_VOICE_CAPTURE_CANCEL_CHANNEL,
  DESKTOP_VOICE_CAPTURE_EVENT_CHANNEL,
  DESKTOP_VOICE_CAPTURE_START_CHANNEL,
  DESKTOP_VOICE_CAPTURE_STOP_CHANNEL,
  VOICE_CAPTURE_ERROR_REASONS,
  VOICE_CAPTURE_MODES,
  type VoiceCaptureErrorReason,
  type VoiceCaptureEvent,
  type VoiceCaptureMode,
  type VoiceCaptureStartOptions,
} from './contracts.js';
import { DICTATION_LANGUAGE_AUTO, resolveDictationSessionLocale } from './dictationLanguage.js';
import {
  assertMainWindowIpcSender,
  isMainWindowIpcSender,
} from './ipcSecurity.js';

export {
  DESKTOP_VOICE_CAPTURE_CANCEL_CHANNEL,
  DESKTOP_VOICE_CAPTURE_EVENT_CHANNEL,
  DESKTOP_VOICE_CAPTURE_START_CHANNEL,
  DESKTOP_VOICE_CAPTURE_STOP_CHANNEL,
};

const DEFAULT_READY_TIMEOUT_MS = 3_000;
const DEFAULT_CANCEL_CLEANUP_TIMEOUT_MS = 1_000;
const DEFAULT_STOP_CLEANUP_TIMEOUT_MS = 5_000;
// SPEC-145 FR-D4: provisional until PLAN-138 Phase 6 records the measurement.
const LINUX_READY_TIMEOUT_MS = 10_000;
const LINUX_STOP_CLEANUP_TIMEOUT_MS = 60_000;
// SPEC-145 FR-D3: timed from `ready`.
const LINUX_RECORDING_WARNING_MS = 25_000;
const LINUX_RECORDING_LIMIT_MS = 30_000;
const MAX_HELPER_STDERR_LINE_LENGTH = 500;

const VOICE_CAPTURE_MODE_SET = new Set<string>(VOICE_CAPTURE_MODES);
const VOICE_CAPTURE_ERROR_REASON_SET = new Set<string>(VOICE_CAPTURE_ERROR_REASONS);

type VoiceCaptureControlType = 'stop' | 'cancel';

interface ActiveVoiceCaptureSession {
  sessionId: string;
  child: ChildProcessWithoutNullStreams;
  ready: boolean;
  expectedExit: boolean;
  stdoutBuffer: string;
  stderrBuffer: string;
  readyTimer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  /** A Linux session: recording cap, `processing`, and the Linux stop window. */
  linux: boolean;
  stopping: boolean;
  warningTimer: ReturnType<typeof setTimeout> | null;
  limitTimer: ReturnType<typeof setTimeout> | null;
  lease: VoiceCaptureHelperLease | null;
}

/** A started helper's hold on the installed pack version (SPEC-145 FR-B4, FR-B6). */
export interface VoiceCaptureHelperLease {
  entryPath: string;
  /** The leased version's manifest languages (SPEC-145 FR-C5). */
  languages: readonly string[];
  release(): void;
}

/**
 * Linux's helper source: the linux-stt pack's start-time check (SPEC-145 FR-B5).
 * It returns null when the pack cannot dictate. `onRevoke` asks the session to
 * stop because the pack is being removed.
 */
export interface VoiceCaptureFeaturePack {
  acquireHelper(onRevoke: () => void): Promise<VoiceCaptureHelperLease | null>;
}

type VoiceCaptureSpawn = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

export interface DesktopVoiceCaptureControllerOptions {
  config: DesktopHostConfig;
  sendEvent: (event: VoiceCaptureEvent) => void;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  resourcesPath?: string;
  spawnProcess?: VoiceCaptureSpawn;
  readyTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  stopCleanupTimeoutMs?: number;
  cancelCleanupTimeoutMs?: number;
  /** Linux only: where the helper comes from (SPEC-145 FR-D2). */
  featurePack?: VoiceCaptureFeaturePack;
  recordingWarningMs?: number;
  recordingLimitMs?: number;
  /**
   * The saved dictation language, read at each start (SPEC-146 FR-5). Without
   * it every session is Automatic.
   */
  dictationLanguage?: () => Promise<string>;
  logLine?: (line: string) => void;
}

export interface VoiceCaptureMainWindow extends Pick<BrowserWindow, 'webContents'> {}

export function parseVoiceCaptureStartOptions(value: unknown): VoiceCaptureStartOptions {
  if (
    typeof value !== 'object'
    || value === null
    || typeof (value as { sessionId?: unknown }).sessionId !== 'string'
    || (value as { sessionId: string }).sessionId.trim().length === 0
  ) {
    throw new Error('Invalid voice capture start payload.');
  }

  const locale = (value as { locale?: unknown }).locale;
  if (locale !== undefined && (typeof locale !== 'string' || locale.trim().length === 0)) {
    throw new Error('Invalid voice capture locale.');
  }

  return {
    sessionId: (value as { sessionId: string }).sessionId.trim(),
    ...(typeof locale === 'string' ? { locale: locale.trim() } : {}),
  };
}

export function parseVoiceCaptureSessionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Invalid voice capture session id.');
  }
  return value.trim();
}

export function isMainWindowVoiceCaptureIpcSender(
  event: unknown,
  mainWindow: Pick<VoiceCaptureMainWindow, 'webContents'> | null,
): boolean {
  return isMainWindowIpcSender(event, mainWindow);
}

export function assertMainWindowVoiceCaptureIpcSender(
  event: unknown,
  mainWindow: VoiceCaptureMainWindow | null,
): asserts mainWindow is VoiceCaptureMainWindow {
  assertMainWindowIpcSender(
    event,
    mainWindow,
    'Desktop voice capture is only available to the main Cats window.',
  );
}

// clipboard-sanitized-write backs navigator.clipboard.writeText (message copy
// buttons); clipboard reads stay denied.
const DESKTOP_RENDERER_ALLOWED_PERMISSIONS = new Set(['display-capture', 'clipboard-sanitized-write']);

export function shouldAllowDesktopRendererPermission(permission: string): boolean {
  return DESKTOP_RENDERER_ALLOWED_PERMISSIONS.has(permission);
}

function isVoiceCaptureMode(value: unknown): value is VoiceCaptureMode {
  return typeof value === 'string' && VOICE_CAPTURE_MODE_SET.has(value);
}

function isVoiceCaptureErrorReason(value: unknown): value is VoiceCaptureErrorReason {
  return typeof value === 'string' && VOICE_CAPTURE_ERROR_REASON_SET.has(value);
}

export function parseVoiceCaptureHelperEvent(line: string): VoiceCaptureEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const event = parsed as Record<string, unknown>;
  if (typeof event.sessionId !== 'string' || event.sessionId.trim().length === 0) {
    return null;
  }
  const sessionId = event.sessionId.trim();

  if (event.type === 'ready') {
    if (typeof event.locale !== 'string' || !isVoiceCaptureMode(event.mode)) {
      return null;
    }
    return {
      type: 'ready',
      sessionId,
      locale: event.locale,
      mode: event.mode,
    };
  }
  if (event.type === 'partial' || event.type === 'final') {
    if (typeof event.text !== 'string') {
      return null;
    }
    return {
      type: event.type,
      sessionId,
      text: event.text,
    };
  }
  if (event.type === 'error') {
    if (!isVoiceCaptureErrorReason(event.reason)) {
      return null;
    }
    return {
      type: 'error',
      sessionId,
      reason: event.reason,
    };
  }
  if (event.type === 'end') {
    return {
      type: 'end',
      sessionId,
    };
  }

  return null;
}

export function resolveVoiceCaptureHelperPath(input: {
  config: DesktopHostConfig;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  resourcesPath?: string;
}): string | null {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;
  const override = env.CATS_VOICE_CAPTURE_HELPER?.trim();
  if (override) {
    return override;
  }

  if (platform === 'darwin') {
    const macosOverride = env.CATS_STT_MACOS_HELPER?.trim();
    if (macosOverride) {
      return macosOverride;
    }
    if (input.config.packaged && input.resourcesPath) {
      return join(input.resourcesPath, 'native', 'macos-stt', 'cats-stt-macos');
    }
    return join(
      input.config.packageRoot,
      'desktop',
      'native',
      'macos-stt',
      '.build',
      'release',
      'cats-stt-macos',
    );
  }

  if (platform === 'win32') {
    const windowsOverride = env.CATS_STT_WINDOWS_HELPER?.trim();
    if (windowsOverride) {
      return windowsOverride;
    }
    if (input.config.packaged && input.resourcesPath) {
      return join(input.resourcesPath, 'native', 'windows-stt', 'cats-stt-windows.exe');
    }
    return join(
      input.config.packageRoot,
      'desktop',
      'native',
      'windows-stt',
      'bin',
      'Release',
      'net8.0-windows10.0.19041.0',
      'win-x64',
      'publish',
      'cats-stt-windows.exe',
    );
  }

  return null;
}

// SPEC-146 FR-5: the locale comes from Settings, never from the renderer.
function buildVoiceCaptureHelperArgs(sessionId: string, locale: string | undefined): string[] {
  return [
    '--session-id',
    sessionId,
    ...(locale ? ['--locale', locale] : []),
  ];
}

function truncateHelperStderr(line: string): string {
  if (line.length <= MAX_HELPER_STDERR_LINE_LENGTH) {
    return line;
  }
  return `${line.slice(0, MAX_HELPER_STDERR_LINE_LENGTH)}...`;
}

function consumeLines(
  previousBuffer: string,
  chunk: Buffer,
  onLine: (line: string) => void,
): string {
  const parts = `${previousBuffer}${chunk.toString('utf8')}`.split(/\r?\n/u);
  const nextBuffer = parts.pop() ?? '';
  for (const line of parts) {
    if (line.trim()) {
      onLine(line);
    }
  }
  return nextBuffer;
}

function writeVoiceCaptureControl(
  session: ActiveVoiceCaptureSession,
  type: VoiceCaptureControlType,
): void {
  session.child.stdin.write(`${JSON.stringify({ type, sessionId: session.sessionId })}\n`);
}

export class DesktopVoiceCaptureController {
  private activeSession: ActiveVoiceCaptureSession | null = null;
  /**
   * A start waiting for the saved language or, on Linux, the pack check. Stop
   * or cancel ends it there, and a newer start supersedes it.
   */
  private pendingStart: { sessionId: string; ended: boolean } | null = null;

  private readonly config: DesktopHostConfig;
  private readonly sendEvent: (event: VoiceCaptureEvent) => void;
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;
  private readonly resourcesPath?: string;
  private readonly spawnProcess: VoiceCaptureSpawn;
  private readonly readyTimeoutMs: number;
  private readonly stopCleanupTimeoutMs: number;
  private readonly cancelCleanupTimeoutMs: number;
  private readonly featurePack: VoiceCaptureFeaturePack | undefined;
  private readonly recordingWarningMs: number;
  private readonly recordingLimitMs: number;
  private readonly dictationLanguage: (() => Promise<string>) | undefined;
  private readonly logLine: (line: string) => void;

  constructor(options: DesktopVoiceCaptureControllerOptions) {
    this.config = options.config;
    this.sendEvent = options.sendEvent;
    this.platform = options.platform ?? process.platform;
    this.env = options.env ?? process.env;
    this.resourcesPath = options.resourcesPath;
    this.spawnProcess = options.spawnProcess ?? spawn;
    const linux = this.platform === 'linux';
    this.readyTimeoutMs = options.readyTimeoutMs
      ?? (linux ? LINUX_READY_TIMEOUT_MS : DEFAULT_READY_TIMEOUT_MS);
    this.stopCleanupTimeoutMs = options.stopCleanupTimeoutMs
      ?? options.cleanupTimeoutMs
      ?? (linux ? LINUX_STOP_CLEANUP_TIMEOUT_MS : DEFAULT_STOP_CLEANUP_TIMEOUT_MS);
    this.cancelCleanupTimeoutMs = options.cancelCleanupTimeoutMs
      ?? options.cleanupTimeoutMs
      ?? DEFAULT_CANCEL_CLEANUP_TIMEOUT_MS;
    this.featurePack = options.featurePack;
    this.recordingWarningMs = options.recordingWarningMs ?? LINUX_RECORDING_WARNING_MS;
    this.recordingLimitMs = options.recordingLimitMs ?? LINUX_RECORDING_LIMIT_MS;
    this.dictationLanguage = options.dictationLanguage;
    this.logLine = options.logLine ?? ((line) => {
      process.stderr.write(`${line}\n`);
    });
  }

  async startVoiceCapture(options: VoiceCaptureStartOptions): Promise<void> {
    if (this.activeSession) {
      await this.cancelVoiceCapture(this.activeSession.sessionId);
    }

    const linux = this.platform === 'linux';
    let lease: VoiceCaptureHelperLease | null = null;
    let helperPath = resolveVoiceCaptureHelperPath({
      config: this.config,
      platform: this.platform,
      env: this.env,
      resourcesPath: this.resourcesPath,
    });
    // SPEC-145 FR-C1, FR-D2: on Linux, the active pack's entry after the FR-B5 check.
    const fromPack = linux && !helperPath;
    let saved = DICTATION_LANGUAGE_AUTO;
    if (this.dictationLanguage || fromPack) {
      // A newer start supersedes one still waiting here, so only one helper runs.
      if (this.pendingStart) {
        this.pendingStart.ended = true;
      }
      const pending = { sessionId: options.sessionId, ended: false };
      this.pendingStart = pending;
      try {
        if (this.dictationLanguage) {
          saved = await this.dictationLanguage().catch(() => DICTATION_LANGUAGE_AUTO);
        }
        if (fromPack && !pending.ended) {
          lease = this.featurePack
            ? await this.featurePack.acquireHelper(() => {
              this.revokeSession(options.sessionId);
            })
            : null;
        }
      } finally {
        if (this.pendingStart === pending) {
          this.pendingStart = null;
        }
      }
      if (pending.ended) {
        lease?.release();
        this.sendEvent({ type: 'end', sessionId: options.sessionId });
        return;
      }
    }
    if (fromPack) {
      if (!lease) {
        this.emitErrorAndEnd(options.sessionId, 'pack_required');
        return;
      }
      helperPath = lease.entryPath;
    }
    if (!helperPath || !existsSync(helperPath)) {
      lease?.release();
      this.emitErrorAndEnd(options.sessionId, 'engine_unavailable');
      return;
    }
    const locale = resolveDictationSessionLocale(
      saved,
      this.platform,
      lease ? lease.languages : null,
    );

    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawnProcess(
        helperPath,
        buildVoiceCaptureHelperArgs(options.sessionId, locale),
        {
          cwd: dirname(helperPath),
          env: this.env,
          shell: false,
        },
      );
    } catch {
      lease?.release();
      this.emitErrorAndEnd(options.sessionId, 'engine_unavailable');
      return;
    }

    const session: ActiveVoiceCaptureSession = {
      sessionId: options.sessionId,
      child,
      ready: false,
      expectedExit: false,
      stdoutBuffer: '',
      stderrBuffer: '',
      readyTimer: null,
      cleanupTimer: null,
      linux,
      stopping: false,
      warningTimer: null,
      limitTimer: null,
      lease,
    };
    this.activeSession = session;

    session.readyTimer = setTimeout(() => {
      if (this.activeSession !== session || session.ready) {
        return;
      }
      this.sendEvent({
        type: 'error',
        sessionId: session.sessionId,
        reason: 'engine_unavailable',
      });
      this.finishSession(session, { emitEnd: true, kill: true });
    }, this.readyTimeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      session.stdoutBuffer = consumeLines(session.stdoutBuffer, chunk, (line) => {
        this.handleHelperEventLine(session, line);
      });
    });
    child.stderr.on('data', (chunk: Buffer) => {
      session.stderrBuffer = consumeLines(session.stderrBuffer, chunk, (line) => {
        this.logLine(`[voice-capture] ${truncateHelperStderr(line)}`);
      });
    });
    child.once('error', () => {
      if (this.activeSession !== session) {
        return;
      }
      this.sendEvent({
        type: 'error',
        sessionId: session.sessionId,
        reason: 'engine_unavailable',
      });
      this.finishSession(session, { emitEnd: true, kill: true });
    });
    child.once('close', () => {
      if (this.activeSession !== session) {
        return;
      }
      if (session.expectedExit) {
        this.finishSession(session, { emitEnd: true, kill: false });
        return;
      }
      this.sendEvent({
        type: 'error',
        sessionId: session.sessionId,
        reason: 'helper_crashed',
      });
      this.finishSession(session, { emitEnd: true, kill: false });
    });
  }

  async stopVoiceCapture(sessionId: string): Promise<void> {
    this.requestSessionEnd(sessionId, 'stop');
  }

  async cancelVoiceCapture(sessionId: string): Promise<void> {
    this.requestSessionEnd(sessionId, 'cancel');
  }

  dispose(): void {
    if (this.activeSession) {
      this.finishSession(this.activeSession, { emitEnd: false, kill: true });
    }
  }

  private handleHelperEventLine(session: ActiveVoiceCaptureSession, line: string): void {
    if (this.activeSession !== session) {
      return;
    }
    const event = parseVoiceCaptureHelperEvent(line);
    if (!event || event.sessionId !== session.sessionId) {
      return;
    }

    if (event.type === 'ready') {
      session.ready = true;
      if (session.readyTimer) {
        clearTimeout(session.readyTimer);
        session.readyTimer = null;
      }
      this.sendEvent(event);
      if (session.linux) {
        this.startRecordingCap(session);
      }
      return;
    }
    if (event.type === 'error') {
      this.sendEvent(event);
      this.finishSession(session, { emitEnd: true, kill: true });
      return;
    }
    if (event.type === 'end') {
      this.finishSession(session, { emitEnd: true, kill: false });
      return;
    }

    this.sendEvent(event);
  }

  /** SPEC-145 FR-D3: warn 5 s before the cap, then stop as the owner would. */
  private startRecordingCap(session: ActiveVoiceCaptureSession): void {
    const secondsRemaining = Math.round((this.recordingLimitMs - this.recordingWarningMs) / 1000);
    session.warningTimer = setTimeout(() => {
      if (this.activeSession === session && !session.stopping) {
        this.sendEvent({ type: 'limit_warning', sessionId: session.sessionId, secondsRemaining });
      }
    }, this.recordingWarningMs);
    session.limitTimer = setTimeout(() => {
      this.requestSessionEnd(session.sessionId, 'stop');
    }, this.recordingLimitMs);
  }

  /** Remove needs the pack's helper gone (SPEC-145 FR-B6). */
  private revokeSession(sessionId: string): void {
    const session = this.activeSession;
    if (!session || session.sessionId !== sessionId) {
      return;
    }
    this.sendEvent({ type: 'error', sessionId, reason: 'aborted' });
    this.finishSession(session, { emitEnd: true, kill: true });
  }

  private requestSessionEnd(sessionId: string, type: VoiceCaptureControlType): void {
    if (this.pendingStart?.sessionId === sessionId) {
      this.pendingStart.ended = true;
      return;
    }
    const session = this.activeSession;
    if (!session || session.sessionId !== sessionId) {
      return;
    }
    if (session.linux && type === 'stop') {
      if (session.stopping) {
        return;
      }
      session.stopping = true;
      this.clearRecordingCap(session);
      // SPEC-145 FR-D3: every stop says transcription has started.
      this.sendEvent({ type: 'processing', sessionId });
    }
    session.expectedExit = true;
    try {
      writeVoiceCaptureControl(session, type);
    } catch {
      this.finishSession(session, { emitEnd: true, kill: true });
      return;
    }

    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
    }
    const cleanupTimeoutMs = type === 'stop'
      ? this.stopCleanupTimeoutMs
      : this.cancelCleanupTimeoutMs;
    session.cleanupTimer = setTimeout(() => {
      if (this.activeSession !== session) {
        return;
      }
      if (session.linux && type === 'stop') {
        // SPEC-145 FR-D4: a helper that outlives the stop window is killed.
        this.sendEvent({
          type: 'error',
          sessionId: session.sessionId,
          reason: 'engine_unavailable',
        });
      }
      this.finishSession(session, { emitEnd: true, kill: true });
    }, cleanupTimeoutMs);
  }

  private clearRecordingCap(session: ActiveVoiceCaptureSession): void {
    if (session.warningTimer) {
      clearTimeout(session.warningTimer);
      session.warningTimer = null;
    }
    if (session.limitTimer) {
      clearTimeout(session.limitTimer);
      session.limitTimer = null;
    }
  }

  private emitErrorAndEnd(sessionId: string, reason: VoiceCaptureErrorReason): void {
    this.sendEvent({ type: 'error', sessionId, reason });
    this.sendEvent({ type: 'end', sessionId });
  }

  private finishSession(
    session: ActiveVoiceCaptureSession,
    options: { emitEnd: boolean; kill: boolean },
  ): void {
    if (this.activeSession !== session) {
      return;
    }
    this.activeSession = null;
    if (session.readyTimer) {
      clearTimeout(session.readyTimer);
      session.readyTimer = null;
    }
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = null;
    }
    this.clearRecordingCap(session);
    session.lease?.release();
    session.lease = null;
    if (options.kill && !session.child.killed) {
      session.child.kill();
    }
    if (options.emitEnd) {
      this.sendEvent({ type: 'end', sessionId: session.sessionId });
    }
  }
}
