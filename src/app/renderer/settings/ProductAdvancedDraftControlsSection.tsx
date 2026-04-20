import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';

const SURFACE_COPY: Record<'chat' | 'code' | 'work', {
  title: string;
  description: string;
  toggleDescription: string;
}> = {
  chat: {
    title: 'Draft builder',
    description: 'Let any Chat draft add collaborators or compare against other models.',
    toggleDescription: 'Shows whichever +collaborate or +compare button each draft entry hides by default.',
  },
  code: {
    title: 'Draft builder',
    description: 'Let any Code draft add collaborators or compare against other models.',
    toggleDescription: 'Shows whichever +collaborate or +compare button each draft entry hides by default.',
  },
  work: {
    title: 'Draft builder',
    description: 'Let any Work draft add collaborators or compare against other models.',
    toggleDescription: 'Shows whichever +collaborate or +compare button each draft entry hides by default.',
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
        description={copy.toggleDescription}
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
