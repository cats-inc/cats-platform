import type { AppShellPayload } from '../../api/contracts.js';
import {
  useOperatorLoop as useWorkspaceOperatorLoop,
} from '../../../shared/renderer/hooks/useOperatorLoop.js';

export function useOperatorLoop(
  readyPayload: AppShellPayload | null,
  operatorRefreshKey: string,
) {
  return useWorkspaceOperatorLoop(readyPayload, operatorRefreshKey);
}
