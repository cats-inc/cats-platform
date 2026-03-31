import type { SuiteProductDescriptor } from '../../../shared/suite-contract.js';
import { SuiteSettingsShell } from './SuiteSettingsShell.js';

export interface SuiteSettingsDataProps {
  products: SuiteProductDescriptor[];
  feedback: string;
  busy: string;
  onResetSetup: () => void;
}

export function SuiteSettingsData({
  products,
  feedback,
  busy,
  onResetSetup,
}: SuiteSettingsDataProps) {
  return (
    <SuiteSettingsShell
      section="data"
      title="Data"
      products={products}
    >
      <div className="contentCard">
        <h2>Reset all data</h2>
        <p className="heroNote">
          This will erase all chats, cats, suite preferences, and setup state.
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
    </SuiteSettingsShell>
  );
}
