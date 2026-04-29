import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { type MessageKey } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';

const SURFACE_COPY: Record<'chat' | 'code' | 'work', {
  title: MessageKey;
  description: MessageKey;
  toggleDescription: MessageKey;
}> = {
  chat: {
    title: 'settingsAdvancedDraftControlsTitle',
    description: 'settingsAdvancedDraftControlsDescription',
    toggleDescription: 'settingsAdvancedDraftControlsToggleDescription',
  },
  code: {
    title: 'settingsAdvancedDraftControlsTitle',
    description: 'settingsAdvancedDraftControlsDescription',
    toggleDescription: 'settingsAdvancedDraftControlsToggleDescription',
  },
  work: {
    title: 'settingsAdvancedDraftControlsTitle',
    description: 'settingsAdvancedDraftControlsDescription',
    toggleDescription: 'settingsAdvancedDraftControlsToggleDescription',
  },
};

export interface ProductAdvancedDraftControlsSectionProps {
  surface: PlatformSurfaceId;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
}

export function ProductAdvancedDraftControlsSection({
  surface,
  enabled,
  disabled = false,
  onToggle,
}: ProductAdvancedDraftControlsSectionProps) {
  if (surface !== 'chat' && surface !== 'code' && surface !== 'work') {
    return null;
  }

  const { t } = useI18n();
  const copy = SURFACE_COPY[surface];

  return (
    <SettingsSection
      header={
        <SettingsSectionHeader
          title={t(copy.title)}
          description={t(copy.description, {
            surface: t(
              `settingsConversationProductLabel${surface === 'chat' ? 'Chat'
                : surface === 'code'
                  ? 'Code'
                  : 'Work'}` as
                | 'settingsConversationProductLabelChat'
                | 'settingsConversationProductLabelCode'
                | 'settingsConversationProductLabelWork',
            ),
          })}
        />
      }
    >
      <SettingsOptionRow
        label={t('settingsAdvancedDraftControlsEnableLabel')}
        description={t(copy.toggleDescription, {
          surface: t(
            `settingsConversationProductLabel${surface === 'chat'
              ? 'Chat'
              : surface === 'code'
                ? 'Code'
                : 'Work'}` as
              | 'settingsConversationProductLabelChat'
              | 'settingsConversationProductLabelCode'
              | 'settingsConversationProductLabelWork',
          ),
        })}
        control={(
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => onToggle(event.target.checked)}
          />
        )}
      />
    </SettingsSection>
  );
}
