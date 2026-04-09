import { createUseAppDraftUiActions } from '../../../shared/renderer/hooks/useWorkspaceAppDraftUiActions.js';
import { CHAT_PREFIX } from '../../shared/channelPaths.js';
import {
  emptyCatForm,
} from '../chatUtils.js';
import type { CatFormState } from '../chatUtils.js';

export const useAppDraftUiActions = createUseAppDraftUiActions<CatFormState>(
  CHAT_PREFIX,
  emptyCatForm,
);
