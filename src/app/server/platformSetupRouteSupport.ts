import type {
  GuideCatFloatingAnchor,
  GuideCatPlacement,
  GuideCatSidecarMode,
  PlatformLobbyAnimationMode,
  PlatformSurfaceId,
} from '../../shared/platform-contract.js';
import type { PlatformPreferences } from '../../shared/platformPreferences.js';
import { cloneProviderModelSelection } from '../../shared/providerSelection.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';

export interface SetupDebugContextInput {
  ownerDisplayName: string;
  createGuideCat: boolean;
  guideCatName?: string | null;
  guideCatProvider?: string | null;
  guideCatInstance?: string | null;
  guideCatModel?: string | null;
  guideCatModelSelection?: ProviderModelSelection | null;
  guideCatId?: string | null;
  setupCompleteAt?: string | null;
  attemptId?: string | null;
}

export interface AssistantPresetBody {
  name?: string;
  provider?: string;
  instance?: string | null;
  model?: string | null;
  modelSelection?: ProviderModelSelection | null;
  roleHint?: string | null;
}

export interface ParsedAssistantPresetBody {
  name: string;
  provider: string;
  instance: string | null;
  model: string;
  modelSelection: ProviderModelSelection | null;
  roleHint: string | null;
}

export interface GuideCatUpdateBody {
  name?: string;
  provider?: string;
  instance?: string | null;
  model?: string | null;
  modelSelection?: ProviderModelSelection | null;
}

export interface ParsedGuideCatUpdateBody {
  name: string;
  provider: string;
  instance: string | null;
  model: string | null;
  modelSelection: ProviderModelSelection | null;
}

export interface PlatformPreferencesUpdateBody {
  lastProductSurface?: string;
  startAtLogin?: boolean;
  openWindowOnStartup?: boolean;
  systemTrayEnabled?: boolean;
  lobbyAnimationMode?: string;
  guideCatSidecarSeen?: boolean;
  guideCatSidecarMode?: string;
  guideCatPlacement?: string;
  guideCatFloatingAnchor?: { x?: unknown; y?: unknown } | null;
}

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function parsePlatformSurface(value: unknown): PlatformSurfaceId | undefined {
  return value === 'chat' || value === 'work' || value === 'code' ? value : undefined;
}

function parseLobbyAnimationMode(value: unknown): PlatformLobbyAnimationMode | undefined {
  return value === 'off' || value === 'reduced' || value === 'full' ? value : undefined;
}

function parseGuideCatSidecarMode(value: unknown): GuideCatSidecarMode | undefined {
  return value === 'auto' || value === 'drawer' || value === 'bubble' ? value : undefined;
}

function parseGuideCatPlacement(value: unknown): GuideCatPlacement | undefined {
  return value === 'floating' || value === 'docked' ? value : undefined;
}

type FloatingAnchorParse =
  | { ok: true; value: GuideCatFloatingAnchor | null }
  | { ok: false; message: string };

function parseGuideCatFloatingAnchorBody(value: unknown): FloatingAnchorParse {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'object') {
    return { ok: false, message: 'guideCatFloatingAnchor must be an object or null' };
  }
  const record = value as Record<string, unknown>;
  const x = record.x;
  const y = record.y;
  if (typeof x !== 'number' || typeof y !== 'number') {
    return { ok: false, message: 'guideCatFloatingAnchor x and y must be numbers' };
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, message: 'guideCatFloatingAnchor x and y must be finite numbers' };
  }
  return {
    ok: true,
    value: {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    },
  };
}

export function buildSetupDebugContext(input: SetupDebugContextInput): Record<string, unknown> {
  const createGuideCat = input.createGuideCat;
  return {
    ownerDisplayName: input.ownerDisplayName,
    createGuideCat,
    guideCatId: input.guideCatId ?? null,
    guideCatName: createGuideCat ? input.guideCatName?.trim() || 'Guide Cat' : null,
    guideCatProvider: createGuideCat ? input.guideCatProvider?.trim() || 'claude' : null,
    guideCatInstance: createGuideCat ? input.guideCatInstance?.trim() || null : null,
    guideCatModel: createGuideCat ? input.guideCatModel ?? null : null,
    hasGuideCatModelSelection: createGuideCat ? Boolean(input.guideCatModelSelection) : false,
    setupCompleteAt: input.setupCompleteAt ?? null,
    attemptId: input.attemptId ?? null,
  };
}

export function normalizeAttemptId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function parsePlatformPreferencesUpdate(
  body: PlatformPreferencesUpdateBody,
  currentPrefs: PlatformPreferences,
): ParseResult<PlatformPreferences> {
  const surface = body.lastProductSurface;
  if (surface !== undefined && parsePlatformSurface(surface) === undefined) {
    return { ok: false, message: 'Invalid product surface' };
  }
  if (body.startAtLogin !== undefined && typeof body.startAtLogin !== 'boolean') {
    return { ok: false, message: 'startAtLogin must be a boolean' };
  }
  if (
    body.openWindowOnStartup !== undefined
    && typeof body.openWindowOnStartup !== 'boolean'
  ) {
    return { ok: false, message: 'openWindowOnStartup must be a boolean' };
  }
  if (
    body.systemTrayEnabled !== undefined
    && typeof body.systemTrayEnabled !== 'boolean'
  ) {
    return { ok: false, message: 'systemTrayEnabled must be a boolean' };
  }
  if (
    body.lobbyAnimationMode !== undefined
    && parseLobbyAnimationMode(body.lobbyAnimationMode) === undefined
  ) {
    return {
      ok: false,
      message: 'lobbyAnimationMode must be off, reduced, or full',
    };
  }
  if (
    body.guideCatSidecarSeen !== undefined
    && typeof body.guideCatSidecarSeen !== 'boolean'
  ) {
    return { ok: false, message: 'guideCatSidecarSeen must be a boolean' };
  }
  if (
    body.guideCatSidecarMode !== undefined
    && parseGuideCatSidecarMode(body.guideCatSidecarMode) === undefined
  ) {
    return {
      ok: false,
      message: 'guideCatSidecarMode must be auto, drawer, or bubble',
    };
  }
  if (
    body.guideCatPlacement !== undefined
    && parseGuideCatPlacement(body.guideCatPlacement) === undefined
  ) {
    return {
      ok: false,
      message: 'guideCatPlacement must be floating or docked',
    };
  }
  let nextFloatingAnchor: GuideCatFloatingAnchor | null | undefined;
  if (body.guideCatFloatingAnchor !== undefined) {
    const parsed = parseGuideCatFloatingAnchorBody(body.guideCatFloatingAnchor);
    if (!parsed.ok) {
      return { ok: false, message: parsed.message };
    }
    nextFloatingAnchor = parsed.value;
  }

  return {
    ok: true,
    value: {
      lastProductSurface: parsePlatformSurface(surface) ?? currentPrefs.lastProductSurface,
      startAtLogin: body.startAtLogin ?? currentPrefs.startAtLogin,
      openWindowOnStartup: body.openWindowOnStartup ?? currentPrefs.openWindowOnStartup,
      systemTrayEnabled: body.systemTrayEnabled ?? currentPrefs.systemTrayEnabled,
      lobbyAnimationMode:
        parseLobbyAnimationMode(body.lobbyAnimationMode) ?? currentPrefs.lobbyAnimationMode,
      guideCatSidecarSeen: body.guideCatSidecarSeen ?? currentPrefs.guideCatSidecarSeen,
      guideCatSidecarMode:
        parseGuideCatSidecarMode(body.guideCatSidecarMode) ?? currentPrefs.guideCatSidecarMode,
      guideCatPlacement:
        parseGuideCatPlacement(body.guideCatPlacement) ?? currentPrefs.guideCatPlacement,
      guideCatFloatingAnchor:
        nextFloatingAnchor !== undefined ? nextFloatingAnchor : currentPrefs.guideCatFloatingAnchor,
    },
  };
}

export function parseAssistantPresetBody(
  body: AssistantPresetBody,
): ParseResult<ParsedAssistantPresetBody> {
  const name = body.name?.trim();
  if (!name) {
    return { ok: false, message: 'Assistant name is required' };
  }

  const provider = body.provider?.trim();
  if (!provider) {
    return { ok: false, message: 'Assistant provider is required' };
  }

  const model = body.model?.trim();
  if (!model) {
    return { ok: false, message: 'Assistant model is required' };
  }

  return {
    ok: true,
    value: {
      name,
      provider,
      instance: body.instance?.trim() || null,
      model,
      modelSelection: cloneProviderModelSelection(body.modelSelection ?? null),
      roleHint: body.roleHint?.trim() || null,
    },
  };
}

export function parseGuideCatUpdateBody(
  body: GuideCatUpdateBody,
): ParseResult<ParsedGuideCatUpdateBody> {
  const name = body.name?.trim();
  if (!name) {
    return { ok: false, message: 'Guide Cat name is required' };
  }

  return {
    ok: true,
    value: {
      name,
      provider: body.provider?.trim() || 'claude',
      instance: body.instance?.trim() || null,
      model: body.model ?? null,
      modelSelection: cloneProviderModelSelection(body.modelSelection ?? null),
    },
  };
}

export function parseGuideCatStatusUpdateBody(body: {
  status?: string;
}): ParseResult<'active' | 'dismissed'> {
  if (body.status !== 'active' && body.status !== 'dismissed') {
    return { ok: false, message: 'status must be active or dismissed' };
  }
  return { ok: true, value: body.status };
}
