import {
  buildTaskRuntimeExecutionRequest,
  type BuildTaskRuntimeExecutionRequestInput,
  type TaskRuntimeExecutionRequest,
} from '../../../shared/taskExecutionBridge.js';

export type BuildCodeTaskRuntimeExecutionRequestInput = Omit<
  BuildTaskRuntimeExecutionRequestInput,
  'fallbackProduct' | 'product'
>;

export function buildCodeTaskRuntimeExecutionRequest(
  input: BuildCodeTaskRuntimeExecutionRequestInput,
): TaskRuntimeExecutionRequest {
  return buildTaskRuntimeExecutionRequest({
    ...input,
    product: 'code',
  });
}
