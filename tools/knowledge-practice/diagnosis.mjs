import assert from 'node:assert/strict';
import { join } from 'node:path';
import { digest, fields, hasRecord, id, readJson, readRecord, safeText, writeNew, writeRecord } from './artifacts.mjs';
import { frozenInputs } from './practice.mjs';
import { readCandidate } from './candidate.mjs';
import { parsePracticeProposal } from '../../build/server/products/work/shared/practiceProposal.js';

const categories = ['product_defect', 'missing_knowledge', 'procedure_error', 'environment_failure'];
async function failedAttempt(runRoot, attemptId) {
  assert.match(attemptId, /^\d{4}$/u);
  const { admission, exercise } = await frozenInputs(runRoot);
  const evaluation = await readRecord(runRoot, 'evaluation.json');
  const attempt = await readRecord(runRoot, `attempt-${attemptId}.json`);
  const candidate = await readCandidate(join(runRoot, 'candidate.json'));
  assert.equal(evaluation.runId, admission.runId);
  assert.equal(evaluation.exerciseDigest, admission.exerciseDigest);
  assert.equal(evaluation.evaluatorDigest, admission.evaluatorDigest);
  assert.equal(evaluation.engineDigest, admission.engineDigest);
  assert.equal(evaluation.candidateDigest, candidate.digest);
  assert.equal(evaluation.attempts.find(row => row.attemptId === attemptId)?.digest, digest(attempt));
  assert.equal(attempt.runId, admission.runId); assert.equal(attempt.attemptId, attemptId);
  assert.equal(attempt.candidateDigest, candidate.digest);
  assert.ok(attempt.failureClass, 'Only a retained failed attempt can be diagnosed.');
  const scenario = exercise.scenarios.find(row => row.id === attempt.scenarioId);
  assert.ok(scenario, 'Attempt is not in the admitted curriculum.');
  return { admission, attempt, scenario };
}

export async function diagnosePractice({ runRoot, attemptId, assessmentFile }) {
  const { admission, attempt, scenario } = await failedAttempt(runRoot, attemptId);
  const assessment = await readJson(assessmentFile, 16 * 1024);
  fields(assessment, ['category', 'diagnosedBy', 'title', 'summary']);
  assert.ok(categories.includes(assessment.category), 'Select one explicit failure category.');
  id(assessment.diagnosedBy); safeText(assessment.summary, 2000);
  if (assessment.title !== undefined) safeText(assessment.title, 160);
  if (assessment.category === 'product_defect') {
    safeText(assessment.title, 160);
    assert.ok(attempt.checks?.some(check => !check.passed), 'A technical outage alone cannot support a code proposal.');
  }
  const inputDigest = digest({ assessment, attemptDigest: digest(attempt) });
  const name = `diagnosis-${attemptId}.json`;
  const existing = async () => {
    const record = await readRecord(runRoot, name);
    assert.equal(record.inputDigest, inputDigest, 'An existing diagnosis cannot be replaced.');
    return record;
  };
  if (await hasRecord(runRoot, name)) return existing();
  const record = { schemaVersion: 1, ...assessment, inputDigest, runId: admission.runId, attemptId,
    attemptDigest: digest(attempt), candidateDigest: attempt.candidateDigest,
    exerciseDigest: admission.exerciseDigest, evidenceMode: admission.evidenceMode,
    technicalFailure: attempt.failureClass, heldOut: scenario.heldOut, diagnosedAt: new Date().toISOString() };
  try { return await writeRecord(runRoot, name, record); }
  catch (error) { if (error.code !== 'EEXIST') throw error; return existing(); }
}

export async function exportDevelopmentProposal({ runRoot, attemptId, outputFile }) {
  const { admission, attempt, scenario } = await failedAttempt(runRoot, attemptId);
  const diagnosis = await readRecord(runRoot, `diagnosis-${attemptId}.json`);
  assert.equal(diagnosis.category, 'product_defect', 'Only product defects yield development proposals.');
  assert.equal(scenario.heldOut, false, 'Held-out diagnoses remain private.');
  assert.equal(diagnosis.heldOut, false);
  assert.equal(diagnosis.runId, admission.runId); assert.equal(diagnosis.attemptId, attemptId);
  assert.equal(diagnosis.attemptDigest, digest(attempt));
  assert.equal(diagnosis.candidateDigest, attempt.candidateDigest);
  assert.equal(diagnosis.exerciseDigest, admission.exerciseDigest);
  assert.equal(diagnosis.evidenceMode, admission.evidenceMode);
  const proposal = parsePracticeProposal({ schemaVersion: 1, source: 'cats-practice', category: 'product_defect',
    evidenceMode: admission.evidenceMode, runId: admission.runId, attemptId, attemptDigest: digest(attempt),
    candidateDigest: attempt.candidateDigest, exerciseDigest: admission.exerciseDigest, diagnosisDigest: digest(diagnosis),
    diagnosedBy: diagnosis.diagnosedBy, title: diagnosis.title, summary: diagnosis.summary });
  await writeNew(outputFile, proposal);
  return { status: 'proposal_only', evidenceMode: proposal.evidenceMode, outputFile };
}
