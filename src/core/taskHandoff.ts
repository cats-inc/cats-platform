import type { CoreTaskRecord } from './types.js';
import type { TaskExecutionProduct } from '../shared/taskPlanning.js';

export type CoreTaskHandoffState =
  | 'pending_review'
  | 'active_here'
  | 'ready_for_pickup'
  | 'completed'
  | 'stopped';

export interface ResolveCoreTaskHandoffStateInput {
  task: Pick<CoreTaskRecord, 'status' | 'approval'>;
  targetProduct: TaskExecutionProduct;
  currentProduct: TaskExecutionProduct;
}

export function taskExecutionProductLabel(product: TaskExecutionProduct): string {
  switch (product) {
    case 'chat':
      return 'Chat';
    case 'code':
      return 'Code';
    default:
      return 'Work';
  }
}

export function resolveCoreTaskHandoffState(
  input: ResolveCoreTaskHandoffStateInput,
): CoreTaskHandoffState {
  const { task, targetProduct, currentProduct } = input;

  if (task.approval.status === 'rejected' || task.status === 'cancelled') {
    return 'stopped';
  }

  if (task.status === 'completed') {
    return 'completed';
  }

  if (
    task.approval.status !== 'approved'
    && task.status !== 'approved'
    && task.status !== 'in_progress'
  ) {
    return 'pending_review';
  }

  if (targetProduct === currentProduct) {
    return 'active_here';
  }

  return 'ready_for_pickup';
}
