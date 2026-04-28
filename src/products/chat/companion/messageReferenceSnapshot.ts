import {
  parseCompanionContentReference,
  serializeCompanionContentReference,
  type CompanionContentReference,
} from './contentReference.js';
import type { CompanionContentPreview } from './contentResolver.js';

/**
 * SPEC-086 / PLAN-077 Phase 5 snapshot persistence.
 *
 * When a chat message is sent, every companion reference it carries is
 * captured as a `CompanionMessageReferenceSnapshot` and stored alongside
 * the message. The transcript reader uses the snapshot as the fallback
 * preview when the live resolver returns `missing` / `deleted` /
 * `inaccessible`, so old messages keep showing meaningful titles even
 * after the underlying record changes.
 */

export const COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION = 1 as const;

export interface CompanionMessageReferenceSnapshot {
  schemaVersion: typeof COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION;
  /** Canonical serialized reference text (`cats://companion/v1/...`). */
  referenceText: string;
  reference: CompanionContentReference;
  /** Title at send time. Renderer falls back to this when the live preview is unavailable. */
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  catName: string;
  capturedAt: string;
  /** Optional opaque snapshot blob — what the resolver provided at send time. */
  snapshot: Record<string, unknown> | null;
}

export function buildCompanionMessageReferenceSnapshot(
  preview: CompanionContentPreview,
  options: { capturedAt?: string } = {},
): CompanionMessageReferenceSnapshot {
  return {
    schemaVersion: COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION,
    referenceText: serializeCompanionContentReference(preview.reference),
    reference: preview.reference,
    title: preview.title,
    subtitle: preview.subtitle,
    description: preview.description,
    thumbnailUrl: preview.thumbnailUrl,
    catName: preview.catName,
    capturedAt: options.capturedAt ?? preview.resolvedAt,
    snapshot: preview.snapshot ?? null,
  };
}

/**
 * Validate and re-hydrate a persisted snapshot. Returns null when the
 * snapshot does not match the expected schema (the renderer should
 * silently fall back to the raw reference text in that case rather than
 * surfacing a confusing partial preview).
 */
export function readCompanionMessageReferenceSnapshot(
  raw: unknown,
): CompanionMessageReferenceSnapshot | null {
  if (!isPlainObject(raw)) return null;
  if (raw.schemaVersion !== COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION) return null;
  const referenceText = raw.referenceText;
  if (typeof referenceText !== 'string') return null;
  const parseResult = parseCompanionContentReference(referenceText);
  if (parseResult.status !== 'parsed') return null;
  const reference = parseResult.reference;
  const title = readNonEmptyString(raw.title) ?? '';
  const capturedAt = readNonEmptyString(raw.capturedAt) ?? '';
  if (capturedAt.length === 0) return null;
  return {
    schemaVersion: COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION,
    referenceText,
    reference,
    title,
    subtitle: readOptionalString(raw.subtitle),
    description: readOptionalString(raw.description),
    thumbnailUrl: readOptionalString(raw.thumbnailUrl),
    catName: readNonEmptyString(raw.catName) ?? 'Companion',
    capturedAt,
    snapshot: isPlainObject(raw.snapshot) ? raw.snapshot : null,
  };
}

/**
 * Build a fallback preview from a persisted snapshot when the live
 * resolver returns missing / deleted / inaccessible. The renderer feeds
 * the result back through `resolveCompanionContentReference`'s `fallback`
 * slot so the freeze-on-non-available rule still applies.
 */
export function snapshotToFallbackPreview(
  snapshot: CompanionMessageReferenceSnapshot,
): {
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  catName: string;
  snapshot: Record<string, unknown> | null;
} {
  return {
    title: snapshot.title,
    subtitle: snapshot.subtitle,
    description: snapshot.description,
    thumbnailUrl: snapshot.thumbnailUrl,
    catName: snapshot.catName,
    snapshot: snapshot.snapshot,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  );
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
