import { useState } from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  createDraftTemporaryParticipant,
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import type { ChatNewChatTemporaryParticipantFormState } from './chatNewChatDraftSidePanel.js';

export function useChatNewChatDraftPanelState(input: {
  payload: AppShellPayload;
  folderBrowseCurrentPath: string;
  folderBrowseLoading: boolean;
  onPickFolder: () => void;
  hasReachedGroupParticipantLimit: boolean;
  visibleDraftCatIds: string[];
  chatCats: AppShellPayload['chat']['cats'];
  draftTemporaryParticipants: DraftTemporaryParticipant[];
  onAddDraftTemporaryParticipant: (
    participant: Omit<DraftTemporaryParticipant, 'participantId'> & {
      participantId?: string | null;
    },
  ) => void;
  onUpdateDraftTemporaryParticipant: (
    participantId: string,
    update: { name?: string | null; roleHint?: string | null },
  ) => void;
}) {
  function createTemporaryParticipantFormValue(): ChatNewChatTemporaryParticipantFormState {
    return {
      roleHint: '',
      provider: input.payload.chat.newChatDefaults?.provider ?? 'claude',
      instance: input.payload.chat.newChatDefaults?.instance ?? '',
      model: input.payload.chat.newChatDefaults?.model ?? '',
      modelSelection: input.payload.chat.newChatDefaults?.modelSelection ?? null,
    };
  }

  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('cats');
  const [temporaryParticipantFormOpen, setTemporaryParticipantFormOpen] = useState(false);
  const [editingTemporaryParticipantId, setEditingTemporaryParticipantId] = useState<string | null>(null);
  const [editingTemporaryParticipantName, setEditingTemporaryParticipantName] = useState('');
  const [temporaryParticipantForm, setTemporaryParticipantForm] = useState<ChatNewChatTemporaryParticipantFormState>(
    createTemporaryParticipantFormValue,
  );

  function switchSection(section: string): void {
    setSidePanelSection(section);
    if (section === 'cwd' && !input.folderBrowseCurrentPath && !input.folderBrowseLoading) {
      input.onPickFolder();
    }
  }

  function openSidePanelTo(section: string): void {
    setSidePanelOpen(true);
    switchSection(section);
  }

  function submitTemporaryParticipant(): void {
    if (input.hasReachedGroupParticipantLimit) {
      return;
    }
    if (!temporaryParticipantForm.provider.trim()) {
      return;
    }

    const takenNames = [
      ...input.visibleDraftCatIds.map((catId) => input.chatCats.find((cat) => cat.id === catId)?.name ?? ''),
      ...input.draftTemporaryParticipants.map((participant) => participant.name),
    ].filter((name) => name.trim().length > 0);

    input.onAddDraftTemporaryParticipant(createDraftTemporaryParticipant({
      provider: temporaryParticipantForm.provider.trim(),
      instance: temporaryParticipantForm.instance.trim() || undefined,
      model: temporaryParticipantForm.model.trim() || undefined,
      modelSelection: temporaryParticipantForm.modelSelection,
      roleHint: temporaryParticipantForm.roleHint.trim() || undefined,
      takenNames,
    }));
    setTemporaryParticipantForm(createTemporaryParticipantFormValue());
    setTemporaryParticipantFormOpen(false);
  }

  function beginTemporaryParticipantRename(participant: DraftTemporaryParticipant): void {
    setEditingTemporaryParticipantId(participant.participantId);
    setEditingTemporaryParticipantName(participant.name);
  }

  function cancelTemporaryParticipantRename(): void {
    setEditingTemporaryParticipantId(null);
    setEditingTemporaryParticipantName('');
  }

  function submitTemporaryParticipantRename(participantId: string): void {
    const nextName = editingTemporaryParticipantName.trim();
    if (!nextName) {
      return;
    }
    input.onUpdateDraftTemporaryParticipant(participantId, { name: nextName });
    cancelTemporaryParticipantRename();
  }

  return {
    createTemporaryParticipantFormValue,
    sidePanelOpen,
    setSidePanelOpen,
    sidePanelSection,
    switchSection,
    openSidePanelTo,
    temporaryParticipantFormOpen,
    setTemporaryParticipantFormOpen,
    editingTemporaryParticipantId,
    editingTemporaryParticipantName,
    setEditingTemporaryParticipantName,
    temporaryParticipantForm,
    setTemporaryParticipantForm,
    submitTemporaryParticipant,
    beginTemporaryParticipantRename,
    cancelTemporaryParticipantRename,
    submitTemporaryParticipantRename,
  };
}
