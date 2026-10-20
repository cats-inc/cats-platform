import {
  startTransition,
  useCallback,
} from 'react';

import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';

export interface WorkspaceDirectLaneModelValueLike {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

export interface UseWorkspaceDirectLaneModelSaveOptions<TPayload> {
  updateCatProfile: (
    catId: string,
    input: WorkspaceDirectLaneModelValueLike,
  ) => Promise<TPayload>;
  publishReadyPayload: (payload: TPayload) => void;
  /**
   * A failed save used to be swallowed here, which left the picker sitting on
   * the previous provider/model with nothing to say why -- indistinguishable,
   * from the user's side, from the selection being silently reverted.
   */
  onError?: (error: unknown) => void;
}

export function useWorkspaceDirectLaneModelSave<TPayload>({
  updateCatProfile,
  publishReadyPayload,
  onError,
}: UseWorkspaceDirectLaneModelSaveOptions<TPayload>) {
  return useCallback(
    async (catId: string, value: WorkspaceDirectLaneModelValueLike): Promise<boolean> => {
      try {
        const result = await updateCatProfile(catId, {
          provider: value.provider,
          instance: value.instance,
          model: value.model,
          modelSelection: value.modelSelection,
        });
        startTransition(() => publishReadyPayload(result));
        return true;
      } catch (error) {
        onError?.(error);
        return false;
      }
    },
    [onError, publishReadyPayload, updateCatProfile],
  );
}

