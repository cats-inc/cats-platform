import { createHash } from 'node:crypto';

/** A query-backed array: export/hash large histories without materializing them again. */
export class JsonArray {
  constructor(readonly values: () => Iterable<unknown>) {}
}

/** Stable object keys, original array order, JSON escaping and a single final newline. */
export function* canonicalJson(value: unknown): Generator<string> {
  yield* tokens(value); yield '\n';
}

export function canonicalDigest(value: unknown): string {
  const hash = createHash('sha256');
  for (const token of canonicalJson(value)) hash.update(token);
  return hash.digest('hex');
}

/** Incremental canonical array proof without collecting the records. */
export class CanonicalArrayDigest {
  private readonly hash = createHash('sha256').update('[');
  private first = true;
  add(value: unknown): void {
    if (!this.first) this.hash.update(',');
    this.first = false;
    for (const token of tokens(value)) this.hash.update(token);
  }
  digest(): string { return this.hash.update(']\n').digest('hex'); }
}

function* tokens(value: unknown): Generator<string> {
  if (Array.isArray(value) || value instanceof JsonArray) {
    yield '[';
    let first = true;
    for (const item of value instanceof JsonArray ? value.values() : value) {
      if (!first) yield ','; first = false;
      yield* tokens(item === undefined ? null : item);
    }
    yield ']'; return;
  }
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    yield '{'; let first = true;
    for (const key of Object.keys(object).sort()) {
      if (object[key] === undefined) continue;
      if (!first) yield ','; first = false;
      yield JSON.stringify(key); yield ':'; yield* tokens(object[key]);
    }
    yield '}'; return;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('Export contains a non-JSON value');
  yield encoded;
}
