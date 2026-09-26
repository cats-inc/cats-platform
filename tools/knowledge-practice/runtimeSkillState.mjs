import assert from 'node:assert/strict';

/** Runtime omits skill state for an empty manifest, even when strict is requested. */
export function assertNoRuntimeSkills(session) {
  for (const value of [session?.hydration, session?.inspection]) {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value),
      'Authoritative Runtime hydration and inspection are required.');
  }
  // Check each authoritative projection so a partial or injected state cannot
  // be mistaken for a fresh session without Runtime-delivered skills.
  assert.equal(session.skills, undefined, 'Unexpected Runtime skill state.');
  assert.equal(session.hydration.skills, undefined, 'Unexpected Runtime skill hydration.');
  assert.equal(session.inspection.skills, undefined, 'Unexpected Runtime skill inspection.');
}
