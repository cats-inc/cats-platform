import {
  startTransition,
  useCallback,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';

import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';
import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  clearBusyState,
  createCatBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import {
  assignCatToChannelApi as assignWorkspaceCatToChannelApi,
  createGlobalCat as createWorkspaceGlobalCat,
  removeCatFromChannelApi as removeWorkspaceCatFromChannelApi,
} from '../api/index.js';
import { emptyCatForm, type CatFormState } from '../workspaceChatUtils.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';

export interface WorkspaceCatAssignmentPayloadLike {
  chat: {
    selectedChannelId: string | null;
    cats: ReadonlyArray<{
      id: string;
      defaultExecutionTarget: {
        provider: string;
        instance: string | null;
        model: string | null;
      };
      defaultModelSelection?: ProviderModelSelection | null;
    }>;
  };
}

type LoadStateLike<TPayload extends WorkspaceCatAssignmentPayloadLike> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

type AssignableCat = {
  id: string;
  defaultExecutionTarget: {
    provider: string;
    instance: string | null;
    model: string | null;
  };
  defaultModelSelection?: ProviderModelSelection | null;
};

export interface WorkspaceCatFormState {
  name: string;
  provider: string;
  instance: string;
  model: string;
  modelSelection: ProviderModelSelection | null;
}

export function useWorkspaceCatAssignmentActions<
  CatFormState extends WorkspaceCatFormState,
  TPayload extends WorkspaceCatAssignmentPayloadLike = AppShellPayload,
>(
  options: {
    state: LoadStateLike<TPayload>;
    setState: Dispatch<SetStateAction<LoadStateLike<TPayload>>>;
    catForm: CatFormState;
    emptyCatForm: () => CatFormState;
    setCatForm: Dispatch<SetStateAction<CatFormState>>;
    setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
    setFeedback: Dispatch<SetStateAction<string>>;
    setAddCatOpen: Dispatch<SetStateAction<boolean>>;
    setDraftCatIds: Dispatch<SetStateAction<string[]>>;
    createGlobalCat?: (input: {
      name: string;
      provider: string;
      instance?: string;
      model?: string;
      modelSelection?: ProviderModelSelection | null;
    }) => Promise<TPayload>;
    assignCatToChannelApi?: (channelId: string, input: {
      catId: string;
      provider: string;
      instance?: string;
      model?: string;
      modelSelection?: ProviderModelSelection | null;
    }) => Promise<TPayload>;
    removeCatFromChannelApi?: (channelId: string, catId: string) => Promise<TPayload>;
  },
) {
  const {
    state,
    setState,
    catForm,
    emptyCatForm,
    setCatForm,
    setBusy,
    setFeedback,
    setAddCatOpen,
    setDraftCatIds,
    createGlobalCat = createWorkspaceGlobalCat as unknown as (input: {
      name: string;
      provider: string;
      instance?: string;
      model?: string;
      modelSelection?: ProviderModelSelection | null;
    }) => Promise<TPayload>,
    assignCatToChannelApi = assignWorkspaceCatToChannelApi as unknown as (
      channelId: string,
      input: {
        catId: string;
        provider: string;
        instance?: string;
        model?: string;
        modelSelection?: ProviderModelSelection | null;
      },
    ) => Promise<TPayload>,
    removeCatFromChannelApi = removeWorkspaceCatFromChannelApi as unknown as (
      channelId: string,
      catId: string,
    ) => Promise<TPayload>,
  } = options;
  const { t } = useI18n();

  const onCreateAndAssignCat = useCallback(async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (state.status !== 'ready') {
      return;
    }

    const channelId = state.payload.chat.selectedChannelId;
    if (!channelId) {
      return;
    }

    setBusy(createCatBusyState('create-assign'));
    try {
      const trimmedName = catForm.name.trim();
      const previousIds = new Set(state.payload.chat.cats.map((participant) => participant.id));
      const created = await createGlobalCat({
        name: trimmedName,
        provider: catForm.provider,
        instance: catForm.instance || undefined,
        model: catForm.model || undefined,
        modelSelection: catForm.modelSelection,
      });
      startTransition(() => setState({ status: 'ready', payload: created }));

      const newCat = created.chat.cats.find((participant) => !previousIds.has(participant.id));
      if (!newCat) {
        setCatForm(emptyCatForm());
        setFeedback(t(messageKeys.chatCatAssignmentCreatedAssignHint));
        setBusy(clearBusyState());
        return;
      }

      const assigned = await assignCatToChannelApi(channelId, {
        catId: newCat.id,
        provider: newCat.defaultExecutionTarget.provider,
        instance: newCat.defaultExecutionTarget.instance ?? undefined,
        model: newCat.defaultExecutionTarget.model ?? undefined,
        modelSelection: newCat.defaultModelSelection ?? undefined,
      });
      startTransition(() => {
        setState({ status: 'ready', payload: assigned });
        setCatForm(emptyCatForm());
        setAddCatOpen(false);
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatCatAssignmentErrorCreateCat));
    } finally {
      setBusy(clearBusyState());
    }
  }, [
    catForm.instance,
    catForm.modelSelection,
    catForm.model,
    catForm.name,
    catForm.provider,
    emptyCatForm,
    setAddCatOpen,
    setBusy,
    setCatForm,
    setFeedback,
    setState,
    state,
    t,
  ]);

  const onAssignExistingCat = useCallback(async (cat: AssignableCat): Promise<void> => {
    if (state.status !== 'ready') {
      return;
    }

    const channelId = state.payload.chat.selectedChannelId;
    if (!channelId) {
      return;
    }

    setBusy(createCatBusyState('assign', cat.id));
    try {
      const payload = await assignCatToChannelApi(channelId, {
        catId: cat.id,
        provider: cat.defaultExecutionTarget.provider,
        instance: cat.defaultExecutionTarget.instance ?? undefined,
        model: cat.defaultExecutionTarget.model ?? undefined,
        modelSelection: cat.defaultModelSelection ?? undefined,
      });
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatCatAssignmentErrorAssignCat));
    } finally {
      setBusy(clearBusyState());
    }
  }, [setBusy, setFeedback, setState, state, t]);

  const onRemoveAssignedCat = useCallback(async (cat: { id: string }): Promise<void> => {
    if (state.status !== 'ready') {
      return;
    }

    const channelId = state.payload.chat.selectedChannelId;
    if (!channelId) {
      return;
    }

    setBusy(createCatBusyState('remove', cat.id));
    try {
      const payload = await removeCatFromChannelApi(channelId, cat.id);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatCatAssignmentErrorRemoveCat));
    } finally {
      setBusy(clearBusyState());
    }
  }, [setBusy, setFeedback, setState, state, t]);

  const toggleDraftCat = useCallback((catId: string): void => {
    setDraftCatIds((current) =>
      current.includes(catId) ? current.filter((id) => id !== catId) : [...current, catId],
    );
  }, [setDraftCatIds]);

  const onCreateAndDraftCat = useCallback(async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (state.status !== 'ready') {
      return;
    }

    setBusy(createCatBusyState('create-assign'));
    try {
      const previousIds = new Set(state.payload.chat.cats.map((participant) => participant.id));
      const created = await createGlobalCat({
        name: catForm.name.trim(),
        provider: catForm.provider,
        instance: catForm.instance || undefined,
        model: catForm.model || undefined,
        modelSelection: catForm.modelSelection,
      });
      startTransition(() => setState({ status: 'ready', payload: created }));
      const newCat = created.chat.cats.find((participant) => !previousIds.has(participant.id));
      if (newCat) {
        setDraftCatIds((current) => [...current, newCat.id]);
      }
      setCatForm(emptyCatForm());
      setAddCatOpen(false);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatCatAssignmentErrorCreateCat));
    } finally {
      setBusy(clearBusyState());
    }
  }, [
    catForm.instance,
    catForm.modelSelection,
    catForm.model,
    catForm.name,
    catForm.provider,
    emptyCatForm,
    setAddCatOpen,
    setBusy,
    setCatForm,
    setDraftCatIds,
    setFeedback,
    setState,
    state,
    t,
  ]);

  return {
    onAssignExistingCat,
    onCreateAndAssignCat,
    onCreateAndDraftCat,
    onRemoveAssignedCat,
    toggleDraftCat,
  };
}

export function useCatAssignmentActions(options: {
  state: LoadStateLike<AppShellPayload>;
  setState: Dispatch<SetStateAction<LoadStateLike<AppShellPayload>>>;
  catForm: CatFormState;
  setCatForm: Dispatch<SetStateAction<CatFormState>>;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setAddCatOpen: Dispatch<SetStateAction<boolean>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
}) {
  return useWorkspaceCatAssignmentActions<CatFormState>({
    ...options,
    emptyCatForm,
  });
}
