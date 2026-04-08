import type {
  Dispatch,
  SetStateAction,
} from 'react';

import type { AppShellPayload } from '../../api/contracts';
import type { ChatOperatorSnapshot } from '../../shared/operator-loop/index';
import { useWorkspaceGovernanceActions } from '../../../shared/renderer/hooks/useWorkspaceGovernanceActions.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

type OperatorStateLike =
  | { status: 'idle'; snapshot: ChatOperatorSnapshot | null; message: string }
  | { status: 'loading'; snapshot: ChatOperatorSnapshot | null; message: string }
  | { status: 'ready'; snapshot: ChatOperatorSnapshot; message: string }
  | { status: 'error'; snapshot: ChatOperatorSnapshot | null; message: string };

export function useGovernanceActions(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  operatorState: OperatorStateLike;
  setOperatorState: Dispatch<SetStateAction<OperatorStateLike>>;
  setBusy: Dispatch<SetStateAction<string>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}) {
  return useWorkspaceGovernanceActions(options);
}
