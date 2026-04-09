import { createUseComposerSubmit } from '../../../shared/renderer/hooks/useWorkspaceComposerSubmit.js';
import { CHAT_PREFIX } from '../../shared/channelPaths';
import type { ModelSelectorValue } from '../components/ModelSelector';

export const useComposerSubmit = createUseComposerSubmit<ModelSelectorValue>(CHAT_PREFIX);
