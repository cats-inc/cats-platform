import { useEffect, useMemo, useRef, useState } from 'react';

import {
  detectCompanionReferences,
  type CompanionReferenceMatch,
} from '../../../../chat/companion/composerReferenceDetector.js';
import {
  parseCompanionContentReference,
  type CompanionContentReference,
} from '../../../../chat/companion/contentReference.js';
import type {
  CompanionContentAvailability,
  CompanionContentPreview,
} from '../../../../chat/companion/contentResolver.js';
import {
  readCompanionMessageReferenceSnapshot,
  type CompanionMessageReferenceSnapshot,
} from '../../../../chat/companion/messageReferenceSnapshot.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

/**
 * Phase 5 transcript hydrator. Reads each persisted-or-detected
 * `cats://companion/v1/...` reference from the message body, calls the
 * Phase 3 resolver route, and renders a preview card per reference.
 *
 * When the live resolve returns `missing` / `deleted` / `inaccessible`
 * AND the message metadata carries a matching snapshot, the renderer
 * falls back to the snapshot's title / catName so old messages keep
 * showing meaningful titles after the underlying source is gone.
 */

export interface CompanionMessageReferencePreviewsProps {
  body: string;
  metadata: Record<string, unknown> | null | undefined;
}

interface PreviewState {
  reference: CompanionContentReference;
  rawText: string;
  status: 'parsed' | 'unsupported_version' | 'invalid';
  loading: boolean;
  preview: CompanionContentPreview | null;
  fallbackSnapshot: CompanionMessageReferenceSnapshot | null;
  parseInvalidReason?: string;
  parseUnsupportedVersion?: string;
}

interface ResolveReferenceResponse {
  parse?: { status?: string };
  preview?: CompanionContentPreview;
}

function readPersistedSnapshots(
  metadata: Record<string, unknown> | null | undefined,
): CompanionMessageReferenceSnapshot[] {
  const raw = metadata?.companionReferenceSnapshots;
  if (!Array.isArray(raw)) return [];
  const out: CompanionMessageReferenceSnapshot[] = [];
  for (const entry of raw) {
    const snapshot = readCompanionMessageReferenceSnapshot(entry);
    if (snapshot) out.push(snapshot);
  }
  return out;
}

function findMatchingSnapshot(
  snapshots: readonly CompanionMessageReferenceSnapshot[],
  reference: CompanionContentReference,
): CompanionMessageReferenceSnapshot | null {
  for (const snapshot of snapshots) {
    if (
      snapshot.reference.scopeId === reference.scopeId
      && snapshot.reference.catId === reference.catId
      && snapshot.reference.type === reference.type
      && snapshot.reference.targetId === reference.targetId
    ) {
      return snapshot;
    }
  }
  return null;
}

export function CompanionMessageReferencePreviews({
  body,
  metadata,
}: CompanionMessageReferencePreviewsProps) {
  const { t } = useI18n();
  const matches = useMemo<CompanionReferenceMatch[]>(
    () => detectCompanionReferences(body),
    [body],
  );
  const snapshots = useMemo(
    () => readPersistedSnapshots(metadata),
    [metadata],
  );
  const persistedRefs = useMemo<CompanionReferenceMatch[]>(() => {
    const out: CompanionReferenceMatch[] = [];
    for (const snapshot of snapshots) {
      const parseResult = parseCompanionContentReference(snapshot.referenceText);
      if (parseResult.status === 'parsed') {
        out.push({
          start: -1,
          end: -1,
          rawText: snapshot.referenceText,
          parseResult,
        });
      }
    }
    return out;
  }, [snapshots]);

  const allRefs = useMemo<CompanionReferenceMatch[]>(() => {
    const seen = new Set<string>();
    const out: CompanionReferenceMatch[] = [];
    for (const candidate of [...matches, ...persistedRefs]) {
      const key = candidate.parseResult.status === 'parsed'
        ? `parsed:${candidate.parseResult.reference.scopeId}:`
          + `${candidate.parseResult.reference.catId}:`
          + `${candidate.parseResult.reference.type}:`
          + `${candidate.parseResult.reference.targetId}`
        : `${candidate.parseResult.status}:${candidate.rawText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(candidate);
    }
    return out;
  }, [matches, persistedRefs]);

  const [previews, setPreviews] = useState<readonly PreviewState[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    if (allRefs.length === 0) {
      setPreviews([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const initial: PreviewState[] = allRefs.map((match) => {
      if (match.parseResult.status === 'parsed') {
        const reference = match.parseResult.reference;
        return {
          reference,
          rawText: match.rawText,
          status: 'parsed',
          loading: true,
          preview: null,
          fallbackSnapshot: findMatchingSnapshot(snapshots, reference),
        };
      }
      if (match.parseResult.status === 'unsupported_version') {
        return {
          reference: {
            version: 'v1',
            scopeId: '',
            catId: '',
            type: 'post',
            targetId: '',
            surface: 'companion',
          },
          rawText: match.rawText,
          status: 'unsupported_version',
          loading: false,
          preview: null,
          fallbackSnapshot: null,
          parseUnsupportedVersion: match.parseResult.version,
        };
      }
      return {
        reference: {
          version: 'v1',
          scopeId: '',
          catId: '',
          type: 'post',
          targetId: '',
          surface: 'companion',
        },
        rawText: match.rawText,
        status: 'invalid',
        loading: false,
        preview: null,
        fallbackSnapshot: null,
        parseInvalidReason: match.parseResult.reason,
      };
    });
    setPreviews(initial);

    void Promise.all(
      initial.map(async (entry, index) => {
        if (entry.status !== 'parsed') return;
        try {
          const response = await fetch(
            `/api/cats/${encodeURIComponent(entry.reference.catId)}/companion-box/resolve-reference`,
            {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'content-type': 'application/json',
              },
              body: JSON.stringify({ referenceText: entry.rawText }),
              signal: controller.signal,
            },
          );
          if (!response.ok) {
            throw new Error(`resolve-reference returned ${response.status}`);
          }
          const data = (await response.json()) as ResolveReferenceResponse;
          if (controller.signal.aborted) return;
          const livePreview = data.preview ?? null;
          setPreviews((current) => {
            if (current[index]?.reference !== entry.reference) return current;
            const next = current.slice();
            next[index] = {
              ...current[index]!,
              loading: false,
              preview: applySnapshotFallback(livePreview, entry.fallbackSnapshot, t),
            };
            return next;
          });
        } catch {
          if (controller.signal.aborted) return;
          setPreviews((current) => {
            if (current[index]?.reference !== entry.reference) return current;
            const next = current.slice();
            next[index] = {
              ...current[index]!,
              loading: false,
              preview: applySnapshotFallback(null, entry.fallbackSnapshot, t),
            };
            return next;
          });
        }
      }),
    );

    return () => {
      controller.abort();
    };
  }, [allRefs, snapshots]);

  if (previews.length === 0) {
    return null;
  }

  return (
    <ul
      className="companionMessageReferenceList"
      aria-label={t(messageKeys.chatCompanionMessageReferenceListAria)}
    >
      {previews.map((entry, index) => (
        <li key={`${entry.rawText}-${index}`} className="companionMessageReferenceItem">
          {renderPreviewCard(entry, t)}
        </li>
      ))}
    </ul>
  );
}

function applySnapshotFallback(
  livePreview: CompanionContentPreview | null,
  snapshot: CompanionMessageReferenceSnapshot | null,
  t: (key: keyof typeof messageKeys) => string,
): CompanionContentPreview | null {
  if (!livePreview) {
    if (!snapshot) return null;
    return {
      reference: snapshot.reference,
      availability: 'missing',
      title: snapshot.title,
      subtitle: snapshot.subtitle,
      description: snapshot.description,
      thumbnailUrl: snapshot.thumbnailUrl,
      icon: null,
      catName: snapshot.catName,
      openRoute: null,
      snapshot: snapshot.snapshot,
      resolvedAt: snapshot.capturedAt,
    };
  }
  if (livePreview.availability !== 'available' && snapshot) {
    return {
      ...livePreview,
      title: livePreview.title === '' || isGenericFallbackTitle(livePreview.title, livePreview.fallbackReason)
        ? snapshot.title
        : livePreview.title,
      subtitle: livePreview.subtitle ?? snapshot.subtitle,
      description: livePreview.description ?? snapshot.description,
      thumbnailUrl: livePreview.thumbnailUrl ?? snapshot.thumbnailUrl,
      catName: livePreview.catName === 'Companion'
        ? snapshot.catName
        : livePreview.catName,
      snapshot: livePreview.snapshot ?? snapshot.snapshot,
    };
  }
  if (livePreview.availability !== 'available' && !snapshot) {
    return {
      ...livePreview,
      title: resolveFallbackTitle(livePreview.availability, t),
      catName: livePreview.catName === 'Companion'
        ? resolveFallbackCatName(t)
        : livePreview.catName,
      description: livePreview.availability === 'inaccessible'
        ? resolveInaccessibleDescription(livePreview.description, t)
        : livePreview.description,
    };
  }
  return livePreview;
}

function resolveFallbackTitle(
  availability: CompanionContentAvailability,
  t: (key: keyof typeof messageKeys) => string,
): string {
  if (availability === 'missing') {
    return t(messageKeys.chatCompanionMessageReferenceMissingFallbackTitle);
  }
  if (availability === 'deleted') {
    return t(messageKeys.chatCompanionMessageReferenceDeletedFallbackTitle);
  }
  return t(messageKeys.chatCompanionMessageReferenceInaccessibleFallbackTitle);
}

function resolveFallbackCatName(t: (key: keyof typeof messageKeys) => string): string {
  return t(messageKeys.chatCompanionMessageReferenceUnknownCompanionLabel);
}

function resolveInaccessibleDescription(
  description: string | null,
  t: (key: keyof typeof messageKeys) => string,
): string {
  if (!description) {
    return t(messageKeys.chatCompanionMessageReferenceInaccessibleFallbackDescription);
  }
  return description;
}

function isGenericFallbackTitle(
  title: string,
  fallbackReason: CompanionContentAvailability | null,
): boolean {
  return title.length === 0 || Boolean(fallbackReason);
}

function renderPreviewCard(
  entry: PreviewState,
  t: (key: keyof typeof messageKeys) => string,
) {
  if (entry.status === 'unsupported_version') {
    return (
      <div className="companionReferenceCard companionReferenceCardUnsupported">
        <span className="companionReferenceCardLabel">
          {t(messageKeys.chatCompanionMessageReferenceUnsupportedVersionLabel)}
        </span>
        {entry.parseUnsupportedVersion ? (
          <span className="companionReferenceCardSubtle">
            ({entry.parseUnsupportedVersion})
          </span>
        ) : null}
      </div>
    );
  }
  if (entry.status === 'invalid') {
    return (
      <div className="companionReferenceCard companionReferenceCardInvalid">
        <span className="companionReferenceCardLabel">
          {t(messageKeys.chatCompanionMessageReferenceMalformedLabel)}
        </span>
        {entry.parseInvalidReason ? (
          <span className="companionReferenceCardSubtle">
            ({entry.parseInvalidReason})
          </span>
        ) : null}
      </div>
    );
  }
  if (entry.loading) {
    return (
      <div className="companionReferenceCard companionReferenceCardLoading">
        <span className="companionReferenceCardLabel">
          {t(messageKeys.chatCompanionMessageReferenceLoadingLabel)}
        </span>
      </div>
    );
  }
  const preview = entry.preview;
  if (!preview) {
    return (
      <div className="companionReferenceCard companionReferenceCardError">
        <span className="companionReferenceCardLabel">
          {t(messageKeys.chatCompanionMessageReferenceUnavailableLabel)}
        </span>
      </div>
    );
  }
  const availabilityClass =
    `companionReferenceCard${capitalize(preview.availability)}`;
  return (
    <div
      className={`companionReferenceCard ${availabilityClass}`}
      data-availability={preview.availability}
    >
      <div className="companionReferenceCardHeader">
        <span className="companionReferenceCardTitle">
          {resolvePreviewTitle(preview, t)}
        </span>
        <span className="companionReferenceCardCat">{preview.catName}</span>
      </div>
      {preview.subtitle ? (
        <span className="companionReferenceCardSubtitle">{preview.subtitle}</span>
      ) : null}
      {preview.description ? (
        <p className="companionReferenceCardDescription">{preview.description}</p>
      ) : null}
      {preview.openRoute ? (
        <a className="companionReferenceCardOpen" href={preview.openRoute}>
          {t(messageKeys.chatCompanionMessageReferenceOpenInCompanionAction)}
        </a>
      ) : null}
      <span
        className="companionReferenceCardAvailability"
        data-availability={preview.availability}
      >
        {labelForAvailability(preview.availability, t)}
      </span>
    </div>
  );
}

function labelForAvailability(
  value: CompanionContentAvailability,
  t: (key: keyof typeof messageKeys) => string,
): string {
  switch (value) {
    case 'available':
      return t(messageKeys.chatCompanionMessageReferenceAvailabilityLivePreview);
    case 'missing':
      return t(messageKeys.chatCompanionMessageReferenceAvailabilityMissing);
    case 'deleted':
      return t(messageKeys.chatCompanionMessageReferenceAvailabilityDeleted);
    case 'inaccessible':
      return t(messageKeys.chatCompanionMessageReferenceAvailabilityInaccessible);
    default: return '';
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function resolvePreviewTitle(
  preview: CompanionContentPreview,
  t: (key: keyof typeof messageKeys) => string,
): string {
  if (preview.generatedTitleKind === 'post') {
    return t(messageKeys.chatCompanionMessageReferenceUntitledPostTitle);
  }
  if (preview.generatedTitleKind === 'source') {
    return t(messageKeys.chatCompanionMessageReferenceUntitledSourceTitle);
  }
  return preview.title;
}
