/**
 * SPEC-086 / PLAN-077 Phase 3: companion content references.
 *
 * Canonical local text form:
 *   cats://companion/v1/{scopeId}/{catId}/{type}/{targetId}
 *
 * Parser ordering (PLAN-077 Phase 3 §"checks in this fixed order"):
 *   1. scheme  (`cats:`)
 *   2. host    (`companion`)
 *   3. percent-decoding of the path segments
 *   4. version (short-circuit `unsupported_version` here)
 *   5. segment count
 *   6. target type
 * `scopeId` mismatches resolve as `inaccessible` at the resolver layer
 * (slice 17), not as `invalid` here.
 */

export const COMPANION_CONTENT_TYPE_VALUES = [
  'post',
  'photo',
  'video',
  'music',
  'file',
] as const;

export type CompanionContentType = typeof COMPANION_CONTENT_TYPE_VALUES[number];

export type CompanionContentReferenceVersion = 'v1';
export const COMPANION_CONTENT_REFERENCE_VERSION: CompanionContentReferenceVersion = 'v1';

export interface CompanionContentReference {
  version: CompanionContentReferenceVersion;
  scopeId: string;
  catId: string;
  type: CompanionContentType;
  targetId: string;
  surface: 'companion';
}

export type CompanionReferenceParseInvalidReason =
  | 'wrong_scheme'
  | 'wrong_host'
  | 'malformed_percent_encoding'
  | 'bad_segment_count'
  | 'unknown_target_type'
  | 'empty_path_segment';

export type CompanionReferenceParseResult =
  | { status: 'parsed'; reference: CompanionContentReference }
  | {
      status: 'unsupported_version';
      rawText: string;
      version: string;
    }
  | {
      status: 'invalid';
      rawText: string;
      reason: CompanionReferenceParseInvalidReason;
    };

export const COMPANION_REFERENCE_SCHEME = 'cats:';
export const COMPANION_REFERENCE_HOST = 'companion';

export function parseCompanionContentReference(
  rawText: string,
): CompanionReferenceParseResult {
  const trimmed = typeof rawText === 'string' ? rawText.trim() : '';
  // 1. Scheme + 2. Host
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith(`${COMPANION_REFERENCE_SCHEME}//`)) {
    return { status: 'invalid', rawText, reason: 'wrong_scheme' };
  }
  const afterScheme = trimmed.slice(`${COMPANION_REFERENCE_SCHEME}//`.length);
  const slashIndex = afterScheme.indexOf('/');
  const host = (slashIndex >= 0 ? afterScheme.slice(0, slashIndex) : afterScheme).toLowerCase();
  if (host !== COMPANION_REFERENCE_HOST) {
    return { status: 'invalid', rawText, reason: 'wrong_host' };
  }
  const pathRaw = slashIndex >= 0 ? afterScheme.slice(slashIndex + 1) : '';
  // 3. Percent-decode each segment (the splitter happens BEFORE decoding so
  // a literal `%2F` cannot smuggle extra segments into the path).
  const rawSegments = pathRaw.length === 0 ? [] : pathRaw.split('/');
  const decoded: string[] = [];
  for (const segment of rawSegments) {
    try {
      decoded.push(decodeURIComponent(segment));
    } catch {
      return { status: 'invalid', rawText, reason: 'malformed_percent_encoding' };
    }
  }

  // 4. Version short-circuits `unsupported_version` BEFORE the segment-count
  // check so a v2 reference with a future segment shape doesn't masquerade
  // as a malformed v1.
  const versionToken = decoded[0];
  if (typeof versionToken === 'string' && versionToken !== COMPANION_CONTENT_REFERENCE_VERSION) {
    return { status: 'unsupported_version', rawText, version: versionToken };
  }

  // 5. Segment count: v1 expects exactly 5 segments
  // (v1, scopeId, catId, type, targetId).
  if (decoded.length !== 5) {
    return { status: 'invalid', rawText, reason: 'bad_segment_count' };
  }

  const [version, scopeId, catId, typeToken, targetId] = decoded as [
    string, string, string, string, string,
  ];
  if (
    scopeId.length === 0
    || catId.length === 0
    || targetId.length === 0
  ) {
    return { status: 'invalid', rawText, reason: 'empty_path_segment' };
  }

  // 6. Target type
  if (!isCompanionContentType(typeToken)) {
    return { status: 'invalid', rawText, reason: 'unknown_target_type' };
  }

  return {
    status: 'parsed',
    reference: {
      version: version as CompanionContentReferenceVersion,
      scopeId,
      catId,
      type: typeToken,
      targetId,
      surface: 'companion',
    },
  };
}

export function serializeCompanionContentReference(
  reference: CompanionContentReference,
): string {
  return [
    `${COMPANION_REFERENCE_SCHEME}//${COMPANION_REFERENCE_HOST}`,
    reference.version,
    encodeURIComponent(reference.scopeId),
    encodeURIComponent(reference.catId),
    reference.type,
    encodeURIComponent(reference.targetId),
  ].join('/');
}

function isCompanionContentType(value: string): value is CompanionContentType {
  return (COMPANION_CONTENT_TYPE_VALUES as readonly string[]).includes(value);
}
