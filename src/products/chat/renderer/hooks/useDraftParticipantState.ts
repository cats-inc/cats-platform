import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import type { AppShellPayload } from '../../api/contracts.js';
import {
  createDraftTemporaryParticipant,
  type DraftTemporaryParticipant,
} from '../chatUtils.js';
import { resolveDraftParticipantSelection } from '../draftParticipants.js';
import type { ExecutionTargetValue } from '../../../shared/renderer/components/ExecutionTarget.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function useDraftParticipantState(options: {
  state: LoadStateLike;
  draftDefaultRecipientCatId: string | null;
  maxDraftGroupParticipants: number;
}) {
  const {
    state,
    draftDefaultRecipientCatId,
    maxDraftGroupParticipants,
  } = options;
  const [draftCatIds, setDraftCatIds] = useState<string[]>([]);
  const [draftTemporaryParticipants, setDraftTemporaryParticipants] = useState<DraftTemporaryParticipant[]>([]);
  const [draftHighlightedCatId, setDraftHighlightedCatId] = useState<string | null>(null);
  const [draftCatExecutionTargetOverrides, setDraftCatExecutionTargetOverrides] = useState<Map<string, ExecutionTargetValue>>(new Map());

  const draftParticipants = useMemo(
    () => resolveDraftParticipantSelection({
      draftDefaultRecipientCatId,
      draftCatIds,
    }),
    [draftCatIds, draftDefaultRecipientCatId],
  );

  const onToggleDraftCat = useCallback((catId: string) => {
    setDraftCatIds((prev) => {
      const isRemoving = prev.includes(catId);
      if (!isRemoving && prev.length + draftTemporaryParticipants.length >= maxDraftGroupParticipants) {
        return prev;
      }
      const next = isRemoving ? prev.filter((id) => id !== catId) : [...prev, catId];
      if (isRemoving) {
        setDraftHighlightedCatId((current) =>
          current === catId ? (next.length > 0 ? next[0] : null) : current);
        setDraftCatExecutionTargetOverrides((overrides) => {
          const copy = new Map(overrides);
          copy.delete(catId);
          return copy;
        });
      } else {
        setDraftHighlightedCatId(catId);
      }
      return next;
    });
  }, [draftTemporaryParticipants.length, maxDraftGroupParticipants]);

  const onAddDraftTemporaryParticipant = useCallback((participant: Omit<DraftTemporaryParticipant, 'participantId'> & {
    participantId?: string | null;
  }) => {
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

  const onDraftCatExecutionTargetOverride = useCallback((catId: string, value: ExecutionTargetValue) => {
    setDraftCatExecutionTargetOverrides((prev) => {
      const copy = new Map(prev);
      copy.set(catId, value);
      return copy;
    });
  }, []);

  return {
    draftCatIds,
    setDraftCatIds,
    draftTemporaryParticipants,
    setDraftTemporaryParticipants,
    draftHighlightedCatId,
    setDraftHighlightedCatId,
    draftCatExecutionTargetOverrides,
    setDraftCatExecutionTargetOverrides,
    draftParticipants,
    onToggleDraftCat,
    onAddDraftTemporaryParticipant,
    onRemoveDraftTemporaryParticipant,
    onUpdateDraftTemporaryParticipant,
    onDraftCatExecutionTargetOverride,
  };
}

