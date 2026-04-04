import type { PlatformProductDescriptor } from '../../../shared/platform-contract.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';

export interface PlatformSettingsDataProps {
  products: PlatformProductDescriptor[];
  feedback: string;
  busy: string;
  onResetSetup: () => void;
}

export function PlatformSettingsData({
  products,
  feedback,
  busy,
  onResetSetup,
}: PlatformSettingsDataProps) {
  return (
    <PlatformSettingsShell
      section="data"
      title="Data"
      products={products}
    >
      <div className="contentCard">
        <h2>Reset all data</h2>
        <p className="heroNote">
          This will erase all chats, cats, platform preferences, and setup state.
          You will be returned to the setup wizard.
        </p>
        <button
          className="dangerButton"
          type="button"
          disabled={busy === 'setup:reset'}
          onClick={onResetSetup}
        >
          {busy === 'setup:reset' ? 'Resetting...' : 'Reset all data'}
        </button>
      </div>
      {feedback ? <p className="feedbackText">{feedback}</p> : null}
    </PlatformSettingsShell>
  );
}
