import type { AppShellPayload } from '../../api/contracts.js';
import { useWorkspaceChannelParticipantUpdate } from '../../../shared/renderer/hooks/useWorkspaceChannelParticipantUpdate.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import type { UpdateChannelParticipantInput } from '../../../shared/api/workspaceContracts.js';

export function useChannelParticipantUpdate(input: {
  updateChannelParticipantApi: (
    channelId: string,
    participantId: string,
    update: UpdateChannelParticipantInput,
  ) => Promise<AppShellPayload>;
  setBusy: (value: WorkspaceBusyState) => void;
  setFeedback: (value: string) => void;
  setState: (value: { status: 'ready'; payload: AppShellPayload }) => void;
}) {
  return useWorkspaceChannelParticipantUpdate<AppShellPayload>(input);
}
