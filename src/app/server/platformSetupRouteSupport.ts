import type {
  PlatformLobbyAnimationMode,
  PlatformSurfaceId,
} from '../../shared/platform-contract.js';
import {
  parsePlatformLobbyAnimationMode,
  normalizePlatformLobbyAnimationMode,
  type PlatformPreferences,
} from '../../shared/platformPreferences.js';
import { cloneProviderModelSelection } from '../../shared/providerSelection.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';
import { GUIDE_CAT_SYSTEM_NAME } from '../../shared/guideCatIdentity.js';
import { normalizePlatformSurface } from '../../shared/platformSurfaces.js';

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
}

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function parsePlatformSurface(value: unknown): PlatformSurfaceId | undefined {
  return normalizePlatformSurface(value) ?? undefined;
}

function parseLobbyAnimationMode(value: unknown): PlatformLobbyAnimationMode | undefined {
  return parsePlatformLobbyAnimationMode(value);
}

export function buildSetupDebugContext(input: SetupDebugContextInput): Record<string, unknown> {
  const createGuideCat = input.createGuideCat;
  return {
    ownerDisplayName: input.ownerDisplayName,
    createGuideCat,
    guideCatId: input.guideCatId ?? null,
    guideCatName: createGuideCat ? input.guideCatName?.trim() || GUIDE_CAT_SYSTEM_NAME : null,
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

  return {
    ok: true,
    value: {
      lastProductSurface: parsePlatformSurface(surface) ?? currentPrefs.lastProductSurface,
      startAtLogin: body.startAtLogin ?? currentPrefs.startAtLogin,
      openWindowOnStartup: body.openWindowOnStartup ?? currentPrefs.openWindowOnStartup,
      systemTrayEnabled: body.systemTrayEnabled ?? currentPrefs.systemTrayEnabled,
      lobbyAnimationMode:
        parseLobbyAnimationMode(body.lobbyAnimationMode) ?? currentPrefs.lobbyAnimationMode,
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
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    return { ok: false, message: 'Unexpected name field. Guide Cat name is system-managed.' };
  }

  return {
    ok: true,
    value: {
      name: GUIDE_CAT_SYSTEM_NAME,
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
