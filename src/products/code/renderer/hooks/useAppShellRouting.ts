import { createUseAppShellRouting } from '../../../shared/renderer/hooks/useWorkspaceAppShellRouting.js';
import { CHAT_PREFIX } from '../../shared/channelPaths.js';

export const useAppShellRouting = createUseAppShellRouting(CHAT_PREFIX);
