import type {
  Dispatch,
  SetStateAction,
} from 'react';

import type { AppShellPayload } from '../../api/contracts.js';
import {
  useWorkspaceCatAssignmentActions,
} from '../../../shared/renderer/hooks/useWorkspaceCatAssignmentActions.js';
import {
  assignCatToChannelApi,
  createGlobalCat,
  removeCatFromChannelApi,
} from '../api/index.js';
import {
  emptyCatForm,
  type CatFormState,
} from '../chatUtils.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function useCatAssignmentActions(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  catForm: CatFormState;
  setCatForm: Dispatch<SetStateAction<CatFormState>>;
  setBusy: Dispatch<SetStateAction<string>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setAddCatOpen: Dispatch<SetStateAction<boolean>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
}) {
  return useWorkspaceCatAssignmentActions<CatFormState, AppShellPayload>({
    ...options,
    emptyCatForm,
    createGlobalCat,
    assignCatToChannelApi,
    removeCatFromChannelApi,
  });
}
