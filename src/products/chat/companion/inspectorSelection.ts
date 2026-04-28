/**
 * SPEC-085 §Inspector lifecycle helpers.
 *
 * The Inspector side-panel section accepts a typed selection
 * `{ type, id }` and persists it through a URL parameter
 * `?inspector=<type>:<id>` so reloads restore it. The selection is
 * stable across tab switches within the same Cat, but clears on
 * Cat / route change.
 *
 * When the underlying record disappears (delete, transient access
 * error, etc.) the renderer keeps a frozen snapshot of the last
 * successful resolve so the panel does not collapse into an empty
 * state mid-flow. The snapshot updates on every successful edit and
 * is frozen one event before the deleted / missing / inaccessible
 * transition lands.
 */

export const INSPECTOR_SELECTION_TYPE_VALUES = [
  'source',
  'derived',
  'memory',
  'post',
  'photo',
  'video',
  'music',
  'file',
  'activity',
] as const;

export type InspectorSelectionType =
  typeof INSPECTOR_SELECTION_TYPE_VALUES[number];

export interface InspectorSelection {
  type: InspectorSelectionType;
  id: string;
}

export interface InspectorSelectionParseResult {
  selection: InspectorSelection | null;
  reason: 'absent' | 'parsed' | 'malformed';
}

const INSPECTOR_PARAM = 'inspector';

const ID_VALIDATION = /^[A-Za-z0-9._:-]+$/u;

export function parseInspectorSelectionParam(
  raw: string | null | undefined,
): InspectorSelectionParseResult {
  if (raw === null || raw === undefined || raw === '') {
    return { selection: null, reason: 'absent' };
  }
  const colonIndex = raw.indexOf(':');
  if (colonIndex <= 0 || colonIndex === raw.length - 1) {
    return { selection: null, reason: 'malformed' };
  }
  const typeToken = raw.slice(0, colonIndex);
  const idToken = raw.slice(colonIndex + 1);
  if (!isInspectorSelectionType(typeToken)) {
    return { selection: null, reason: 'malformed' };
  }
  if (!ID_VALIDATION.test(idToken)) {
    return { selection: null, reason: 'malformed' };
  }
  return { selection: { type: typeToken, id: idToken }, reason: 'parsed' };
}

export function readInspectorSelectionFromSearch(
  search: string | URLSearchParams | null | undefined,
): InspectorSelectionParseResult {
  if (search === null || search === undefined) {
    return { selection: null, reason: 'absent' };
  }
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(search);
  return parseInspectorSelectionParam(params.get(INSPECTOR_PARAM));
}

export function serializeInspectorSelection(
  selection: InspectorSelection | null,
): string | null {
  if (!selection) return null;
  if (!isInspectorSelectionType(selection.type)) return null;
  if (!ID_VALIDATION.test(selection.id)) return null;
  return `${selection.type}:${selection.id}`;
}

export function applyInspectorSelectionToSearch(
  search: string | URLSearchParams,
  selection: InspectorSelection | null,
): string {
  const params =
    search instanceof URLSearchParams
      ? new URLSearchParams(search)
      : new URLSearchParams(search);
  if (!selection) {
    params.delete(INSPECTOR_PARAM);
  } else {
    const serialized = serializeInspectorSelection(selection);
    if (serialized) {
      params.set(INSPECTOR_PARAM, serialized);
    } else {
      params.delete(INSPECTOR_PARAM);
    }
  }
  return params.toString();
}

export type InspectorResolveStatus =
  | 'available'
  | 'missing'
  | 'deleted'
  | 'inaccessible';

export interface InspectorResolvedSnapshot<TData> {
  selection: InspectorSelection;
  data: TData;
  resolvedAt: string;
}

export interface InspectorSnapshotState<TData> {
  selection: InspectorSelection | null;
  status: InspectorResolveStatus | null;
  snapshot: InspectorResolvedSnapshot<TData> | null;
}

export interface InspectorSnapshotTransitionInput<TData> {
  previous: InspectorSnapshotState<TData>;
  selection: InspectorSelection | null;
  status: InspectorResolveStatus | null;
  data: TData | null;
  resolvedAt: string;
}

/**
 * Pure transition helper: given the previous snapshot state and the
 * latest resolve result, return the next state. Used by both the
 * renderer hook and tests so the freeze rule (last-good-resolve
 * survives a delete/missing/inaccessible transition) cannot drift.
 */
export function nextInspectorSnapshotState<TData>(
  input: InspectorSnapshotTransitionInput<TData>,
): InspectorSnapshotState<TData> {
  if (input.selection === null) {
    return { selection: null, status: null, snapshot: null };
  }
  if (
    input.previous.snapshot
    && !inspectorSelectionsEqual(input.previous.snapshot.selection, input.selection)
  ) {
    // The user moved to a new selection — clear the stale snapshot before
    // applying the new resolve result.
    return resolveSnapshot({
      previousSnapshot: null,
      selection: input.selection,
      status: input.status,
      data: input.data,
      resolvedAt: input.resolvedAt,
    });
  }
  return resolveSnapshot({
    previousSnapshot: input.previous.snapshot,
    selection: input.selection,
    status: input.status,
    data: input.data,
    resolvedAt: input.resolvedAt,
  });
}

function resolveSnapshot<TData>(input: {
  previousSnapshot: InspectorResolvedSnapshot<TData> | null;
  selection: InspectorSelection;
  status: InspectorResolveStatus | null;
  data: TData | null;
  resolvedAt: string;
}): InspectorSnapshotState<TData> {
  if (input.status === 'available' && input.data !== null) {
    return {
      selection: input.selection,
      status: 'available',
      snapshot: {
        selection: input.selection,
        data: input.data,
        resolvedAt: input.resolvedAt,
      },
    };
  }
  // Non-available status: keep the previous snapshot frozen so the panel
  // continues to render the last-known state.
  return {
    selection: input.selection,
    status: input.status,
    snapshot: input.previousSnapshot,
  };
}

export function inspectorSelectionsEqual(
  left: InspectorSelection | null,
  right: InspectorSelection | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.type === right.type && left.id === right.id;
}

function isInspectorSelectionType(value: string): value is InspectorSelectionType {
  return (INSPECTOR_SELECTION_TYPE_VALUES as readonly string[]).includes(value);
}
