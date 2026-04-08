import {
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { useWorkspaceAppShellRouting } from '../../../shared/renderer/hooks/useWorkspaceAppShellRouting.js';
import type { AppShellPayload } from '../../api/contracts';
import { CHAT_PREFIX } from '../../shared/channelPaths.js';
import type { ChatLifecycleState } from '../../shared/lifecycle';
import type { SelectedChannelView } from '../chatUtils';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function useAppShellRouting(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  busy: string;
  routeChannelId: string | null;
  routeChannelExists: boolean;
  selectedChannelId: string | null;
  selectedChannelViewId: string | null;
  selectedChannelEntryLifecycle: ChatLifecycleState | null;
  draftDefaultRecipientCatId: string | null;
  showingMyCatDirectLane: boolean;
  routeDirectLaneSummary: { id: string } | null;
  readySelectedChannel: SelectedChannelView | null;
}) {
  return useWorkspaceAppShellRouting({
    ...options,
    chatPrefix: CHAT_PREFIX,
  });
}
