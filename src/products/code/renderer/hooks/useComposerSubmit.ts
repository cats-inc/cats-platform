import { createUseComposerSubmit } from '../../../shared/renderer/hooks/useWorkspaceComposerSubmit.js';
import { CHAT_PREFIX } from '../../shared/channelPaths';
import type { ExecutionTargetValue } from '../../../shared/renderer/components/ExecutionTarget.js';

export const useComposerSubmit = createUseComposerSubmit<ExecutionTargetValue>(CHAT_PREFIX);

