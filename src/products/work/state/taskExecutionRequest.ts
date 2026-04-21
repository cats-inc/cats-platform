import {
  buildTaskRuntimeExecutionRequest,
  type BuildTaskRuntimeExecutionRequestInput,
  type TaskRuntimeExecutionRequest,
} from '../../../shared/taskExecutionBridge.js';

export type BuildWorkTaskRuntimeExecutionRequestInput = Omit<
  BuildTaskRuntimeExecutionRequestInput,
  'fallbackProduct' | 'product'
>;

export function buildWorkTaskRuntimeExecutionRequest(
  input: BuildWorkTaskRuntimeExecutionRequestInput,
): TaskRuntimeExecutionRequest {
  return buildTaskRuntimeExecutionRequest({
    ...input,
    fallbackProduct: 'work',
  });
}
