import { useState } from 'react';

export function useWorkspaceAppTransientState<TState, TCatForm>(input: {
  initialState: TState;
  createEmptyCatForm: () => TCatForm;
  pickGreeting: () => string;
}) {
  const [state, setState] = useState<TState>(input.initialState);
  const [composerDraft, setComposerDraft] = useState('');
  const [catForm, setCatForm] = useState<TCatForm>(input.createEmptyCatForm);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [addCatTab, setAddCatTab] = useState<'existing' | 'new'>('existing');
  const [greeting] = useState(input.pickGreeting);
  const [draftCwd, setDraftCwd] = useState<string | null>(null);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [channelFiles, setChannelFiles] = useState<File[]>([]);

  return {
    state,
    setState,
    composerDraft,
    setComposerDraft,
    catForm,
    setCatForm,
    busy,
    setBusy,
    feedback,
    setFeedback,
    addCatTab,
    setAddCatTab,
    greeting,
    draftCwd,
    setDraftCwd,
    draftFiles,
    setDraftFiles,
    channelFiles,
    setChannelFiles,
  };
}
