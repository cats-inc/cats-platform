import type { AppShellPayload } from '../../api/contracts.js';
import {
  useSettingsCatsTelegram as useWorkspaceSettingsCatsTelegram,
} from '../../../shared/renderer/hooks/useSettingsCatsTelegram.js';

export function useSettingsCatsTelegram(payload: AppShellPayload) {
  return useWorkspaceSettingsCatsTelegram(payload);
}
