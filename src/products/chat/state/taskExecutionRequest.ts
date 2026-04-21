import {
  buildTaskRuntimeExecutionRequest,
  type BuildTaskRuntimeExecutionRequestInput,
  type TaskRuntimeExecutionRequest,
} from '../../../shared/taskExecutionBridge.js';

export type BuildChatTaskRuntimeExecutionRequestInput = Omit<
  BuildTaskRuntimeExecutionRequestInput,
  'fallbackProduct' | 'product'
>;

export function buildChatTaskRuntimeExecutionRequest(
  input: BuildChatTaskRuntimeExecutionRequestInput,
): TaskRuntimeExecutionRequest {
  return buildTaskRuntimeExecutionRequest({
    ...input,
    fallbackProduct: 'chat',
  });
}
