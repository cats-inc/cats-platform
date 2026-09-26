import assert from 'node:assert/strict';
import { lstat, opendir } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, digest, evidenceIds, fields, integer, physical, readPlain, safeText } from './artifacts.mjs';

// Reader for the current private journal contract, not an execution capability.
const QUOTAS = { createSession: 1, sendMessage: 1, judge: 1, observeSession: 4,
  cancelSession: 2, closeSession: 2, confirmCleanup: 2 };
const METERED = new Set(['sendMessage', 'judge']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const EFFECT = /^effect-(\d{4})-(intent|result|failure)\.json$/u;
const RECONCILE = /^reconcile-(\d{4})\.json$/u;
const ROW_FIELDS = ['id', 'method', 'invoked', 'settled', 'usageTokens', 'inputDigest', 'sessionId', 'requestId'];
const MAX_FILES = 128, MAX_BYTES = 16 * 1024, MAX_TOTAL_BYTES = 512 * 1024;

async function inventory(directory) {
  const names = [];
  for await (const entry of await opendir(directory, { bufferSize: MAX_FILES + 1 })) {
    assert.ok(names.length < MAX_FILES, 'Journal file count exceeds its budget.');
    names.push(entry.name);
  }
  return names.sort();
}

function exact(value, keys) {
  fields(value, keys); assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
function validateRow(row, id, kind) {
  exact(row, [...ROW_FIELDS, ...(kind === 'intent' ? ['target'] : kind === 'result' ? ['outcome', 'responseDigest'] : ['outcome'])]);
  integer(id, 1, 32); assert.equal(row.id, id); assert.ok(Object.hasOwn(QUOTAS, row.method));
  assert.match(row.inputDigest, HASH);
  assert.equal(typeof row.invoked, 'boolean'); assert.equal(row.settled, kind !== 'intent');
  if (row.method === 'createSession') assert.match(row.requestId, UUID);
  else { assert.equal(row.requestId, null); assert.equal(row.sessionId, null); }
  if (row.sessionId !== null) safeText(row.sessionId, 160);
  if (kind === 'intent') {
    assert.equal(row.invoked, false); assert.equal(row.sessionId, null); assert.equal(row.usageTokens, 0);
    exact(row.target, ['provider', 'instance', 'model']);
    for (const value of Object.values(row.target)) safeText(value, 100);
  } else {
    assert.equal(row.outcome, kind === 'result' ? 'returned' : 'failed');
    if (kind === 'result') {
      assert.equal(row.invoked, true); assert.match(row.responseDigest, HASH);
      if (row.method === 'createSession') safeText(row.sessionId, 160);
    }
    if (!row.invoked || !METERED.has(row.method)) assert.equal(row.usageTokens, 0);
    else if (row.usageTokens !== null) integer(row.usageTokens, row.method === 'sendMessage' ? 1 : 0, Number.MAX_SAFE_INTEGER);
    if (!row.invoked) assert.equal(row.sessionId, null);
  }
}
function sameCall(intent, terminal) {
  for (const key of ['id', 'method', 'inputDigest', 'requestId']) assert.deepEqual(terminal[key], intent[key]);
}

/**
 * Inspect one reset's retained effects without importing an evaluator, contacting
 * Runtime, invoking cleanup or changing any evidence. Consistency is not origin
 * authentication, and even a stable read proves nothing about current processes.
 */
export async function inspectCatlasEffects({ evaluationRoot, resetId }) {
  assert.match(resetId, UUID);
  const root = await physical(evaluationRoot);
  const report = { schemaVersion: 1, resetId, structuralStatus: 'consistent', readStable: true,
    provenance: 'unauthenticated', currentCleanup: 'unobserved', replayAllowed: false,
    recordedKnownTokens: 0, usageUncertain: true, journalDigest: null,
    target: null, effects: [], historicalReconciliations: [], sealed: null, diagnostics: [] };
  const diagnose = (code, effectId) => {
    report.diagnostics.push({ code, ...(effectId === undefined ? {} : { effectId }) });
    report.structuralStatus = 'invalid';
  };
  let directory;
  try {
    for (const parts of [['resets'], ['resets', resetId], ['resets', resetId, 'effects']]) {
      directory = join(root, ...parts);
      const info = await lstat(directory);
      assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Journal directories must not be aliases.');
      assert.equal(await physical(directory), directory, 'Journal directory escaped its physical root.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { ...report, structuralStatus: 'missing', diagnostics: [{ code: 'journal_missing' }] };
  }
  const names = await inventory(directory);
  const rows = new Map(), fingerprints = [];
  let totalBytes = 0;
  for (const name of names) {
    const match = EFFECT.exec(name), cleanup = RECONCILE.exec(name);
    if (!match && !cleanup && name !== 'sealed.json') { diagnose('unexpected_artifact'); continue; }
    const group = match ? rows.get(Number(match[1])) ?? { id: Number(match[1]), records: {}, kinds: new Set(), invalid: false } : null;
    if (group) { rows.set(group.id, group); group.kinds.add(match[2]); }
    let data;
    try {
      const bytes = await readPlain(join(directory, name), Math.min(MAX_BYTES, MAX_TOTAL_BYTES - totalBytes));
      totalBytes += bytes.length; assert.ok(totalBytes <= MAX_TOTAL_BYTES);
      fingerprints.push([name, digest(bytes)]);
      const encoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      data = JSON.parse(encoded);
      assert.equal(encoded, `${canonical(data)}\n`, 'Expected the canonical journal encoding.');
    } catch {
      if (group) group.invalid = true;
      diagnose('unreadable_artifact', match ? Number(match[1]) : undefined); continue;
    }
    if (match) {
      const id = Number(match[1]), kind = match[2];
      try { validateRow(data, id, kind); group.records[kind] = data; }
      catch { group.invalid = true; diagnose('invalid_effect_record', id); }
    } else if (cleanup) {
      try {
        integer(Number(cleanup[1]), 1, 9999);
        exact(data, ['generation', 'observed', 'currentGeneration']);
        integer(data.generation, 0, 64); integer(data.currentGeneration, data.generation, 64);
        exact(data.observed, ['status', 'evidenceRefs']); evidenceIds(data.observed.evidenceRefs);
        assert.ok(['complete', 'incomplete'].includes(data.observed.status));
        report.historicalReconciliations.push({ sequence: Number(cleanup[1]), ...data });
      } catch { diagnose('invalid_reconciliation'); }
    } else {
      try {
        exact(data, ['resetId', 'reason', 'generation']); assert.equal(data.resetId, resetId);
        safeText(data.reason, 160); integer(data.generation, 0, 64); report.sealed = data;
      } catch { diagnose('invalid_seal'); }
    }
  }
  // Re-read only bounded, recognized artifacts. A changing or unreadable journal
  // retains no aggregate usage claim; this does not establish parent liveness.
  try {
    assert.equal(await physical(directory), directory);
    assert.deepEqual(await inventory(directory), names);
    let rereadBytes = 0;
    for (const [name, hash] of fingerprints) {
      const bytes = await readPlain(join(directory, name), Math.min(MAX_BYTES, MAX_TOTAL_BYTES - rereadBytes));
      rereadBytes += bytes.length; assert.equal(digest(bytes), hash);
    }
  } catch { report.readStable = false; diagnose('journal_changed_during_read'); }
  report.journalDigest = report.structuralStatus === 'consistent' ? digest(fingerprints) : null;
  const counts = new Map();
  for (const group of [...rows.values()].sort((a, b) => a.id - b.id)) {
    const { intent, result, failure } = group.records;
    const terminals = [result, failure].filter(Boolean);
    if (!intent) { group.invalid = true; diagnose('missing_intent', group.id); }
    if (group.kinds.has('result') && group.kinds.has('failure')) { group.invalid = true; diagnose('conflicting_terminals', group.id); }
    if (intent) {
      const count = (counts.get(intent.method) ?? 0) + 1; counts.set(intent.method, count);
      if (count > QUOTAS[intent.method]) { group.invalid = true; diagnose('effect_quota_exceeded', group.id); }
      if (report.target === null) report.target = intent.target;
      else if (canonical(report.target) !== canonical(intent.target)) { group.invalid = true; diagnose('target_disagrees', group.id); }
      for (const terminal of terminals) {
        try { sameCall(intent, terminal); }
        catch { group.invalid = true; diagnose('terminal_disagrees', group.id); }
      }
    }
    const terminal = group.invalid ? null : terminals[0];
    report.effects.push({ id: group.id, method: intent?.method ?? null,
      requestId: intent?.requestId ?? null,
      invocation: terminal ? terminal.invoked ? 'recorded_invoked' : 'recorded_not_invoked' : 'unknown',
      settlement: terminal ? terminal.outcome : 'unknown',
      recordedTokens: terminal?.usageTokens ?? null,
      recordedClaims: terminals.map(row => ({ method: row.method, outcome: row.outcome, invoked: row.invoked,
        usageTokens: row.usageTokens, sessionId: row.sessionId, requestId: row.requestId })) });
  }
  let priorGeneration = 0, sequence = 0;
  for (const row of report.historicalReconciliations) {
    if (row.sequence !== ++sequence || row.generation < priorGeneration || row.currentGeneration > rows.size * 2
      || (report.sealed && row.generation < report.sealed.generation)) diagnose('inconsistent_reconciliation_generation');
    priorGeneration = row.currentGeneration;
  }
  if (report.sealed && report.sealed.generation > rows.size * 2) diagnose('inconsistent_seal_generation');
  const complete = report.effects.length > 0 && report.effects.every(row => row.settlement !== 'unknown' && row.recordedTokens !== null);
  report.usageUncertain = !complete || !report.sealed || report.structuralStatus !== 'consistent' || !report.readStable;
  const known = report.effects.reduce((sum, row) => sum + (row.recordedTokens ?? 0), 0);
  if (!Number.isSafeInteger(known)) { diagnose('usage_sum_exceeds_integer_bound'); report.usageUncertain = true; }
  report.recordedKnownTokens = report.readStable && Number.isSafeInteger(known) ? known : null;
  if (report.structuralStatus !== 'consistent') report.journalDigest = null;
  return report;
}
