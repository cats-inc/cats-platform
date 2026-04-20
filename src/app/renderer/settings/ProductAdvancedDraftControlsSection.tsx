import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';

const SURFACE_COPY: Record<'chat' | 'code' | 'work', {
  title: string;
  description: string;
}> = {
  chat: {
    title: 'Draft builder',
    description: 'Expose group and compare controls directly on fresh Chat drafts.',
  },
  code: {
    title: 'Draft builder',
    description: 'Expose Team Code and Peer Code controls directly on fresh Code drafts.',
  },
  work: {
    title: 'Draft builder',
    description: 'Expose collaborator and compare controls directly on fresh Work drafts.',
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

  const copy = SURFACE_COPY[surface];

  return (
    <SettingsSection
      header={
        <SettingsSectionHeader
          title={copy.title}
          description={copy.description}
        />
      }
    >
      <SettingsOptionRow
        label="Enable advanced draft controls"
        description="Adds the blue group and compare buttons to new drafts without pre-filling extra participants or compare targets."
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
