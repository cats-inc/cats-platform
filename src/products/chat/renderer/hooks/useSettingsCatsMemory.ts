import {
  useSettingsCatsMemory as useWorkspaceSettingsCatsMemory,
  type SettingsCatsMemoryController,
} from '../../../shared/renderer/hooks/useSettingsCatsMemory.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';

export type { SettingsCatsMemoryController };

export function useSettingsCatsMemory(input: {
  expandedCatId: string | null;
  onBusy: (busy: WorkspaceBusyState) => void;
  onFeedback: (message: string) => void;
}): SettingsCatsMemoryController {
  return useWorkspaceSettingsCatsMemory(input);
}
