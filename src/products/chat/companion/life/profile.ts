import type {
  CompanionLifeProfile,
  UpdateCompanionLifeProfileInput,
} from '../contracts.js';

/** SPEC-124 FR-1 defaults. */
export const COMPANION_LIFE_DEFAULTS = {
  enabled: true,
  bedtime: '23:00',
  wakeWindowStart: '07:00',
  wakeWindowEnd: '09:00',
} as const;

const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/** Minutes since local midnight for an `HH:MM` value, or null when malformed. */
export function parseClockMinutes(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = CLOCK_PATTERN.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const PHOTO_FOLDER_MAX_LENGTH = 1024;
/** POSIX root, a Windows drive, or a UNC share; no `node:path` so the renderer can share this. */
const ABSOLUTE_HOST_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;

export function createDefaultCompanionLifeProfile(nowIso: string): CompanionLifeProfile {
  return {
    ...COMPANION_LIFE_DEFAULTS,
    sleepUntil: null,
    photoFolder: null,
    updatedAt: nowIso,
  };
}

function readPhotoFolder(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readClock(value: unknown, fallback: string): string {
  return parseClockMinutes(value) === null ? fallback : (value as string).trim();
}

/** Boxes written before SPEC-124 have no `life`; each invalid field falls back alone (FR-2). */
export function normalizeCompanionLifeProfile(raw: unknown, nowIso: string): CompanionLifeProfile {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const sleepUntil = typeof record.sleepUntil === 'string'
    && Number.isFinite(Date.parse(record.sleepUntil))
    ? record.sleepUntil
    : null;
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : COMPANION_LIFE_DEFAULTS.enabled,
    bedtime: readClock(record.bedtime, COMPANION_LIFE_DEFAULTS.bedtime),
    wakeWindowStart: readClock(record.wakeWindowStart, COMPANION_LIFE_DEFAULTS.wakeWindowStart),
    wakeWindowEnd: readClock(record.wakeWindowEnd, COMPANION_LIFE_DEFAULTS.wakeWindowEnd),
    sleepUntil,
    photoFolder: readPhotoFolder(record.photoFolder),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : nowIso,
  };
}

/** Store-level patch: owner settings plus the wake/sleep intent (`sleepUntil`). */
export interface CompanionLifeProfilePatch extends UpdateCompanionLifeProfileInput {
  sleepUntil?: string | null;
}

export function applyCompanionLifeProfilePatch(
  current: CompanionLifeProfile,
  patch: CompanionLifeProfilePatch,
  nowIso: string,
): CompanionLifeProfile {
  return {
    enabled: patch.enabled ?? current.enabled,
    bedtime: patch.bedtime ?? current.bedtime,
    wakeWindowStart: patch.wakeWindowStart ?? current.wakeWindowStart,
    wakeWindowEnd: patch.wakeWindowEnd ?? current.wakeWindowEnd,
    sleepUntil: patch.sleepUntil !== undefined ? patch.sleepUntil : current.sleepUntil,
    photoFolder: patch.photoFolder !== undefined ? patch.photoFolder : current.photoFolder,
    updatedAt: nowIso,
  };
}

export type CompanionLifeUpdateValidation =
  | { ok: true; update: UpdateCompanionLifeProfileInput }
  | { ok: false; code: string; message: string };

/** SPEC-124 FR-3: validates an owner PATCH against the profile it would produce. */
export function validateCompanionLifeUpdate(
  current: CompanionLifeProfile,
  body: unknown,
): CompanionLifeUpdateValidation {
  const input = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  if (!input) {
    return { ok: false, code: 'invalid_companion_life', message: 'Expected a JSON object.' };
  }
  const update: UpdateCompanionLifeProfileInput = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') {
      return { ok: false, code: 'invalid_companion_life', message: 'enabled must be a boolean.' };
    }
    update.enabled = input.enabled;
  }
  if (input.photoFolder !== undefined) {
    const folder = input.photoFolder === null ? null : readPhotoFolder(input.photoFolder);
    if (
      input.photoFolder !== null
      && (
        folder === null
        || folder.length > PHOTO_FOLDER_MAX_LENGTH
        || !ABSOLUTE_HOST_PATH_PATTERN.test(folder)
      )
    ) {
      return {
        ok: false,
        code: 'invalid_companion_photo_folder',
        message: 'photoFolder must be an absolute folder path, or null.',
      };
    }
    update.photoFolder = folder;
  }
  for (const key of ['bedtime', 'wakeWindowStart', 'wakeWindowEnd'] as const) {
    if (input[key] === undefined) {
      continue;
    }
    if (parseClockMinutes(input[key]) === null) {
      return { ok: false, code: 'invalid_companion_life_clock', message: `${key} must be HH:MM.` };
    }
    update[key] = (input[key] as string).trim();
  }

  const wakeStart = parseClockMinutes(update.wakeWindowStart ?? current.wakeWindowStart)!;
  const wakeEnd = parseClockMinutes(update.wakeWindowEnd ?? current.wakeWindowEnd)!;
  const bedtime = parseClockMinutes(update.bedtime ?? current.bedtime)!;
  if (wakeEnd < wakeStart) {
    return {
      ok: false,
      code: 'invalid_companion_life_wake_window',
      message: 'wakeWindowEnd must not be earlier than wakeWindowStart.',
    };
  }
  if (bedtime >= wakeStart && bedtime <= wakeEnd) {
    return {
      ok: false,
      code: 'invalid_companion_life_bedtime',
      message: 'bedtime must not fall inside the wake window.',
    };
  }
  return { ok: true, update };
}
