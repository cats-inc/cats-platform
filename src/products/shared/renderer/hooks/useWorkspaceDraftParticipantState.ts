import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  createDraftTemporaryParticipant,
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import { resolveDraftParticipantSelection } from '../draftParticipants.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function useWorkspaceDraftParticipantState(
  options: {
    state: LoadStateLike;
    draftDefaultRecipientCatId: string | null;
    draftCatIds: string[];
    maxDraftGroupParticipants: number;
  },
) {
  const {
    state,
    draftDefaultRecipientCatId,
    draftCatIds,
    maxDraftGroupParticipants,
  } = options;
  const [draftTemporaryParticipants, setDraftTemporaryParticipants] = useState<DraftTemporaryParticipant[]>([]);

  const draftParticipants = useMemo(
    () => resolveDraftParticipantSelection({
      draftDefaultRecipientCatId,
      draftCatIds,
    }),
    [draftCatIds, draftDefaultRecipientCatId],
  );

  const onAddDraftTemporaryParticipant = useCallback((
    participant: Omit<DraftTemporaryParticipant, 'participantId'> & {
      participantId?: string | null;
    },
  ) => {
    setDraftTemporaryParticipants((prev) => {
      if (draftParticipants.participantCatIds.length + prev.length >= maxDraftGroupParticipants) {
        return prev;
      }
      const takenNames = [
        ...draftParticipants.participantCatIds.map((catId) =>
          (state.status === 'ready'
            ? state.payload.chat.cats.find((cat) => cat.id === catId)?.name
            : null) ?? ''),
        ...prev.map((candidate) => candidate.name),
      ].filter((name) => name.trim().length > 0);
      return [
        ...prev,
        createDraftTemporaryParticipant({
          ...participant,
          takenNames,
          randomUUID: () => window.crypto.randomUUID(),
        }),
      ];
    });
  }, [draftParticipants.participantCatIds, maxDraftGroupParticipants, state]);

  const onRemoveDraftTemporaryParticipant = useCallback((participantId: string) => {
    setDraftTemporaryParticipants((prev) =>
      prev.filter((participant) => participant.participantId !== participantId));
  }, []);

  const onUpdateDraftTemporaryParticipant = useCallback((
    participantId: string,
    input: { name?: string | null; roleHint?: string | null },
  ) => {
    setDraftTemporaryParticipants((prev) =>
      prev.map((participant) =>
        participant.participantId === participantId
          ? {
              ...participant,
              ...(input.name !== undefined ? { name: input.name?.trim() || participant.name } : {}),
              ...(input.roleHint !== undefined
                ? { roleHint: input.roleHint?.trim() || undefined }
                : {}),
            }
          : participant),
    );
  }, []);

  return {
    draftTemporaryParticipants,
    setDraftTemporaryParticipants,
    draftParticipants,
    onAddDraftTemporaryParticipant,
    onRemoveDraftTemporaryParticipant,
    onUpdateDraftTemporaryParticipant,
  };
}
