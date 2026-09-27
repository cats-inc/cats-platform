import { createHash } from 'node:crypto';
import type { CoreStore } from '../../../core/store.js';
import { upsertCoreTask } from '../../../core/model/index.js';
import { parsePracticeProposal } from '../shared/practiceProposal.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Owner-confirmed import creates a proposal only, never execution or approval. */
export async function importPracticeProposal(coreStore: CoreStore, input: unknown) {
  const proposal = parsePracticeProposal(input);
  const sourceDigest = digest(Object.entries(proposal).sort(([a], [b]) => a.localeCompare(b)));
  let taskId = '', created = false;
  await coreStore.updateCore(core => {
    const ownerActorId = core.ownerProfile.actorId;
    taskId = `task-practice-${digest([ownerActorId, proposal.runId, proposal.attemptId]).slice(0, 32)}`;
    const existing = core.tasks.find(row => row.id === taskId);
    if (existing) {
      if (existing.metadata.practiceProposalDigest !== sourceDigest) throw new Error('practice_proposal_conflict');
      return core;
    }
    created = true;
    return upsertCoreTask(core, { id: taskId, ownerActorId,
      title: `${proposal.evidenceMode === 'fixture' ? '[fixture] ' : ''}${proposal.title}`, summary: proposal.summary, status: 'pending_approval',
      approval: { status: 'pending' }, assignedActorIds: [],
      metadata: { source: 'practice-development-proposal', practiceProposal: proposal,
        practiceProposalDigest: sourceDigest, verification: 'owner_supplied_unverified' },
    }).core;
  });
  return { taskId, created, path: `/work/tasks/${encodeURIComponent(taskId)}` };
}
