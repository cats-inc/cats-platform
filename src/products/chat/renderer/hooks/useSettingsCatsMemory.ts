import {
  useSettingsCatsMemory as useWorkspaceSettingsCatsMemory,
  type SettingsCatsMemoryController,
} from '../../../shared/renderer/hooks/useSettingsCatsMemory.js';

export type { SettingsCatsMemoryController };

export function useSettingsCatsMemory(input: {
  expandedCatId: string | null;
  onBusy: (key: string) => void;
  onFeedback: (message: string) => void;
}): SettingsCatsMemoryController {
  return useWorkspaceSettingsCatsMemory(input);
}
