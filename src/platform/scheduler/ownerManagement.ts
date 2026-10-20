import { createHash } from 'node:crypto';
import type { CatsCoreState } from '../../core/types.js';
import { CoreConflictError, CoreNotFoundError, CoreValidationError } from '../../core/errors.js';
import type { SchedulerState } from './contracts.js';

export function previewScheduleOwner(state: SchedulerState, core: CatsCoreState, id: string, scope: unknown) {
  if (scope !== 'rule' && scope !== 'receipts') throw new CoreValidationError('Choose rule removal or receipt detail cleanup.');
  const rule = state.rules.find(rule => rule.id === id);
  if (!rule) throw new CoreNotFoundError('Schedule no longer exists.');
  const receipts = state.triggerReceipts.filter(receipt => receipt.ruleId === id);
  const runs = core.runs.filter(run => (run.metadata.scheduleTrigger as { ruleId?: string } | undefined)?.ruleId === id || receipts.some(receipt => receipt.runId === run.id));
  const blockers = [
    ...(scope === 'rule' && rule.enabled ? ['Disable this schedule before removing its rule.'] : []),
    ...(receipts.some(receipt => receipt.status === 'claimed') ? ['A trigger is still being admitted. Wait for its final receipt before cleanup.'] : []),
    ...(runs.some(run => !['completed', 'failed', 'cancelled'].includes(run.status)) ? ['Scheduled execution is active. Stop it from its Run first.'] : []),
  ];
  const token = createHash('sha256').update(JSON.stringify({ rule, receipts, runs, scope })).digest('hex');
  return { token, id, scope, title: rule.title, blockers, receiptCount: receipts.length, retainedRuns: runs.map(run => ({ id: run.id, title: run.title })), retainedReceipts: receipts.map(receipt => ({ id: receipt.id, status: receipt.status })), ruleRemoved: scope === 'rule', detailOnly: scope === 'receipts' };
}

export function applyScheduleOwner(state: SchedulerState, core: CatsCoreState, id: string, body: Record<string, unknown>): SchedulerState {
  const preview = previewScheduleOwner(state, core, id, body.scope);
  if (body.token !== preview.token) throw new CoreConflictError('Schedule history changed. Preview it again.');
  if (preview.blockers.length) throw new CoreConflictError(preview.blockers.join(' '));
  return { ...state, updatedAt: new Date().toISOString(),
    rules: body.scope === 'rule' ? state.rules.filter(rule => rule.id !== id) : state.rules,
    ...(body.scope === 'rule' ? { deletedRuleIds: [...new Set([...(state.deletedRuleIds ?? []), id])] } : {}),
    triggerReceipts: state.triggerReceipts.map(receipt => receipt.ruleId === id ? { ...receipt, message: null, metadata: { ownerDetailCleared: true } } : receipt) };
}
