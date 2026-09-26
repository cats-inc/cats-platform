import assert from 'node:assert/strict';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const EVALUATOR_MAX_BYTES = 256 * 1024;

export function canonical(value) {
  const seen = new Set();
  function visit(item, depth) {
    assert.ok(depth <= 32, 'JSON nesting exceeds its budget.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') { assert.ok(Number.isFinite(item), 'Expected finite JSON number.'); return JSON.stringify(item); }
    assert.ok(item && typeof item === 'object' && !seen.has(item), 'Expected acyclic JSON data.');
    assert.ok(Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null,
      'Expected a plain JSON object.');
    seen.add(item);
    let result;
    if (Array.isArray(item)) {
      assert.equal(Reflect.ownKeys(item).length, item.length + 1, 'Extra array properties are not JSON data.');
      for (let index = 0; index < item.length; index++) assert.ok(Object.hasOwn(item, index), 'Sparse arrays are not JSON data.');
      result = `[${item.map((entry) => visit(entry, depth + 1)).join(',')}]`;
    } else {
      result = `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${visit(item[key], depth + 1)}`).join(',')}}`;
    }
    seen.delete(item);
    return result;
  }
  return visit(value, 0);
}
export const digest = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value)
  ? value : canonical(value)).digest('hex');
export function fields(value, allowed) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Expected an object.');
  assert.ok(Object.keys(value).every((key) => allowed.includes(key)), 'Unexpected artifact field.');
}
export function id(value) {
  assert.ok(typeof value === 'string' && /^[a-z][a-z0-9._-]{0,79}$/u.test(value), 'Invalid stable ID.');
  return value;
}
export function integer(value, min, max) {
  assert.ok(Number.isSafeInteger(value) && value >= min && value <= max, 'Invalid bounded integer.');
  return value;
}
export function safeText(value, max = 4_000) {
  assert.ok(typeof value === 'string' && value.trim() && value.length <= max, 'Invalid bounded text.');
  assert.ok(!/(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/|Bearer\s+\S+|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|\.agents[\\/]|SKILL\.md|cats-inc-development|cats-practice-and-distill)/u.test(value),
    'Private or development-only content requires sanitization.');
  return value;
}
export function evidenceIds(value) {
  assert.ok(Array.isArray(value) && value.length > 0 && value.length <= 32, 'Missing bounded evidence IDs.');
  for (const ref of value) assert.ok(typeof ref === 'string' && /^[a-z][a-z0-9.:-]{0,159}$/u.test(ref), 'Invalid evidence reference.');
  return value;
}
export async function readPlain(file, max = 256 * 1024) {
  const info = await lstat(file);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size <= max, 'Expected a bounded regular artifact.');
  const bytes = await readFile(file);
  assert.ok(bytes.length === info.size && bytes.length <= max, 'Artifact changed during read.');
  return bytes;
}
export async function readJson(file, max) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readPlain(file, max)));
}
export async function writeNew(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const fd = await open(file, 'wx', 0o600);
  try { await fd.writeFile(typeof value === 'string' ? value : `${canonical(value)}\n`); await fd.sync(); }
  finally { await fd.close(); }
}
export async function physical(file) {
  let cursor = resolve(file);
  const suffix = [];
  for (;;) {
    try { return resolve(await realpath(cursor), ...suffix); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(cursor);
      assert.notEqual(parent, cursor, 'Cannot resolve physical root.');
      suffix.unshift(relative(parent, cursor)); cursor = parent;
    }
  }
}
export function contains(root, child) {
  const suffix = relative(root, child);
  return !suffix || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}
export async function assertSeparated(authorRoots, protectedPaths) {
  assert.ok(Array.isArray(authorRoots) && authorRoots.length > 0, 'Declare the author write roots.');
  for (const author of authorRoots) for (const protectedPath of protectedPaths) {
    const a = await physical(author), p = await physical(protectedPath);
    assert.ok(!contains(a, p) && !contains(p, a), 'Author and evaluator scopes must be physically disjoint.');
  }
}
async function key(root) {
  const value = (await readPlain(join(root, '.receipt-key'), 64)).toString('utf8');
  assert.match(value, /^[a-f0-9]{64}$/u, 'Invalid private receipt key.');
  return value;
}
export async function writeRecord(root, name, payload) {
  assert.match(name, /^[a-z0-9.-]+\.json$/u);
  const mac = createHmac('sha256', await key(root)).update(canonical(payload)).digest('hex');
  await writeNew(join(root, name), { payload, mac });
  return payload;
}
export async function readRecord(root, name) {
  assert.match(name, /^[a-z0-9.-]+\.json$/u);
  const record = await readJson(join(root, name), 2 * 1024 * 1024);
  fields(record, ['payload', 'mac']);
  assert.ok(typeof record.mac === 'string' && /^[a-f0-9]{64}$/u.test(record.mac), 'Unauthenticated receipt.');
  const actual = createHmac('sha256', await key(root)).update(canonical(record.payload)).digest();
  assert.ok(timingSafeEqual(actual, Buffer.from(record.mac, 'hex')), 'Unauthenticated receipt.');
  return record.payload;
}
export async function hasRecord(root, name) {
  try { await lstat(join(root, name)); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
