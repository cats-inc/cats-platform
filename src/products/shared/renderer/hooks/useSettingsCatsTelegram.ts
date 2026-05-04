import { useEffect, useState } from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  beginSettingsCatsTelegramScopeLoad,
  createSettingsCatsTelegramAutoLoader,
  createSettingsCatsTelegramScopeKey,
  fetchSettingsCatsTelegramSnapshot,
} from '../../settings-cats/telegramDiagnostics.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import {
  fetchTelegramTransportDiagnostics,
  fetchTelegramTransportStatus,
  type TelegramTransportDiagnostics,
  type TelegramTransportStatus,
} from '../api/index.js';
import { formatSettingsCatsTelegramLoadError } from './settingsCatsTelegramErrorLabels.js';

export function useSettingsCatsTelegram(payload: AppShellPayload): {
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  telegramStatus: TelegramTransportStatus | null;
  telegramDiagnostics: TelegramTransportDiagnostics | null;
  telegramLoading: boolean;
  telegramError: string;
  refreshTelegramDiagnostics: () => Promise<void>;
} {
  const { t } = useI18n();
  const botBindings = payload.chat.botBindings ?? [];
  const telegramScopeKey = createSettingsCatsTelegramScopeKey({
    bossCatId: payload.chat.bossCatId,
    botBindings,
  });
  const telegramDiagnosticsLoadError = t(
    messageKeys.sharedSettingsCatsTelegramDiagnosticsLoadError,
  );
  const [telegramStatus, setTelegramStatus] = useState<TelegramTransportStatus | null>(null);
  const [telegramDiagnostics, setTelegramDiagnostics] = useState<TelegramTransportDiagnostics | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState('');
  const [telegramAutoLoader] = useState(() => createSettingsCatsTelegramAutoLoader({
    fetchStatus: fetchTelegramTransportStatus,
    fetchDiagnostics: fetchTelegramTransportDiagnostics,
  }));

  useEffect(() => {
    const loadRun = beginSettingsCatsTelegramScopeLoad(
      telegramAutoLoader,
      telegramScopeKey,
      telegramDiagnosticsLoadError,
      {
        onStart() {
          setTelegramLoading(true);
          setTelegramError('');
        },
        onSuccess(snapshot) {
          setTelegramStatus(snapshot.status);
          setTelegramDiagnostics(snapshot.diagnostics);
        },
        onError(message) {
          setTelegramStatus(null);
          setTelegramDiagnostics(null);
          setTelegramError(formatSettingsCatsTelegramLoadError(
            message,
            telegramDiagnosticsLoadError,
          ));
        },
        onFinish() {
          setTelegramLoading(false);
        },
      },
    );
    return loadRun.cancel;
  }, [telegramAutoLoader, telegramDiagnosticsLoadError, telegramScopeKey]);

  async function refreshTelegramDiagnostics(): Promise<void> {
    setTelegramLoading(true);
    setTelegramError('');
    try {
      const snapshot = await fetchSettingsCatsTelegramSnapshot({
        fetchStatus: fetchTelegramTransportStatus,
        fetchDiagnostics: fetchTelegramTransportDiagnostics,
      });
      setTelegramStatus(snapshot.status);
      setTelegramDiagnostics(snapshot.diagnostics);
    } catch (error) {
      setTelegramStatus(null);
      setTelegramDiagnostics(null);
      setTelegramError(formatSettingsCatsTelegramLoadError(
        error,
        telegramDiagnosticsLoadError,
      ));
    } finally {
      setTelegramLoading(false);
    }
  }

  return {
    botBindings,
    telegramStatus,
    telegramDiagnostics,
    telegramLoading,
    telegramError,
    refreshTelegramDiagnostics,
  };
}
