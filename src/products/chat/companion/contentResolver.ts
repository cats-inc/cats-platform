import type {
  CompanionContentReference,
} from './contentReference.js';

/**
 * SPEC-086 §preview envelope.
 *
 * The resolver is intentionally a pure function over a `lookup` callback:
 * the caller (HTTP route, renderer hook) supplies the actual data fetch
 * and the resolver decides the availability state. This keeps the rules
 * (scopeId mismatch → `inaccessible`, lookup-null → `missing`, snapshot
 * preservation across non-available transitions) testable without IO.
 */

export type CompanionContentAvailability =
  | 'available'
  | 'missing'
  | 'deleted'
  | 'inaccessible';

export interface CompanionContentPreview {
  reference: CompanionContentReference;
  availability: CompanionContentAvailability;
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  icon: string | null;
  catName: string;
  openRoute: string | null;
  snapshot: Record<string, unknown> | null;
  resolvedAt: string;
}

export interface CompanionContentLookupSuccess {
  status: 'available';
  preview: Omit<
    CompanionContentPreview,
    'reference' | 'availability' | 'snapshot' | 'resolvedAt'
  > & { snapshot?: Record<string, unknown> | null };
}

export interface CompanionContentLookupMissing {
  status: 'missing' | 'deleted';
  /**
   * Optional last-known preview the resolver should freeze into the
   * envelope so the renderer can keep showing the title etc. The
   * Inspector lifecycle helpers (slice 15) own the cross-resolve
   * preservation; this is just the fallback for a single resolve.
   */
  fallback?: Omit<
    CompanionContentPreview,
    'reference' | 'availability' | 'snapshot' | 'resolvedAt'
  > & { snapshot?: Record<string, unknown> | null };
}

export type CompanionContentLookupResult =
  | CompanionContentLookupSuccess
  | CompanionContentLookupMissing;

export interface ResolveCompanionContentReferenceInput {
  reference: CompanionContentReference;
  currentScopeId: string;
  lookup: (
    reference: CompanionContentReference,
  ) => Promise<CompanionContentLookupResult> | CompanionContentLookupResult;
  resolvedAt?: string;
}

export const FALLBACK_INACCESSIBLE_TITLE = 'Companion content from another workspace';
export const FALLBACK_MISSING_TITLE = 'Companion content unavailable';
export const FALLBACK_DELETED_TITLE = 'Companion content deleted';

export async function resolveCompanionContentReference(
  input: ResolveCompanionContentReferenceInput,
): Promise<CompanionContentPreview> {
  const resolvedAt = input.resolvedAt ?? new Date().toISOString();

  if (input.reference.scopeId !== input.currentScopeId) {
    return buildInaccessiblePreview(input.reference, resolvedAt);
  }

  const lookupResult = await input.lookup(input.reference);

  if (lookupResult.status === 'available') {
    return {
      reference: input.reference,
      availability: 'available',
      title: lookupResult.preview.title,
      subtitle: lookupResult.preview.subtitle ?? null,
      description: lookupResult.preview.description ?? null,
      thumbnailUrl: lookupResult.preview.thumbnailUrl ?? null,
      icon: lookupResult.preview.icon ?? null,
      catName: lookupResult.preview.catName,
      openRoute: lookupResult.preview.openRoute ?? null,
      snapshot: lookupResult.preview.snapshot ?? null,
      resolvedAt,
    };
  }

  return buildFallbackPreview({
    reference: input.reference,
    availability: lookupResult.status,
    fallback: lookupResult.fallback,
    resolvedAt,
  });
}

function buildInaccessiblePreview(
  reference: CompanionContentReference,
  resolvedAt: string,
): CompanionContentPreview {
  return {
    reference,
    availability: 'inaccessible',
    title: FALLBACK_INACCESSIBLE_TITLE,
    subtitle: null,
    description:
      'This companion content lives in a different platform-host data '
      + 'scope and cannot be opened here.',
    thumbnailUrl: null,
    icon: null,
    catName: 'Unknown companion',
    openRoute: null,
    snapshot: null,
    resolvedAt,
  };
}

function buildFallbackPreview(input: {
  reference: CompanionContentReference;
  availability: 'missing' | 'deleted';
  fallback: CompanionContentLookupMissing['fallback'];
  resolvedAt: string;
}): CompanionContentPreview {
  const fallbackTitle =
    input.availability === 'deleted'
      ? FALLBACK_DELETED_TITLE
      : FALLBACK_MISSING_TITLE;
  return {
    reference: input.reference,
    availability: input.availability,
    title: input.fallback?.title ?? fallbackTitle,
    subtitle: input.fallback?.subtitle ?? null,
    description: input.fallback?.description ?? null,
    thumbnailUrl: input.fallback?.thumbnailUrl ?? null,
    icon: input.fallback?.icon ?? null,
    catName: input.fallback?.catName ?? 'Companion',
    openRoute: input.fallback?.openRoute ?? null,
    snapshot: input.fallback?.snapshot ?? null,
    resolvedAt: input.resolvedAt,
  };
}
