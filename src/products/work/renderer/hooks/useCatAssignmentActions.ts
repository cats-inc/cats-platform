import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';

import { useWorkspaceCatAssignmentActions } from '../../../shared/renderer/hooks/useWorkspaceCatAssignmentActions.js';
import type { AppShellPayload } from '../../api/contracts';
import {
  emptyCatForm,
  type CatFormState,
} from '../chatUtils';

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
  return useWorkspaceCatAssignmentActions<CatFormState>({
    ...options,
    emptyCatForm,
  });
}
