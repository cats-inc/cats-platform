import { useCallback, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ConfirmDialog, useConfirmDialog } from '../../../design/components/ConfirmDialog.js';
import type { SuiteHostEnvelope } from '../../../shared/suite-contract.js';
import { SuiteSettingsData } from './SuiteSettingsData.js';
import { SuiteSettingsGeneral } from './SuiteSettingsGeneral.js';
import { SuiteSettingsRuntime } from './SuiteSettingsRuntime.js';
import './suite-settings.css';

export interface SuiteSettingsRoutesProps {
  envelope: SuiteHostEnvelope;
  onEnvelopeUpdate: (updater: (current: SuiteHostEnvelope) => SuiteHostEnvelope) => void;
}

interface SuiteSettingsRouteTreeProps extends SuiteSettingsRoutesProps {
  feedback: string;
  busy: string;
  onFeedback: (message: string) => void;
  onResetSetup: () => void;
}

export function SuiteSettingsRouteTree({
  envelope,
  onEnvelopeUpdate,
  feedback,
  busy,
  onFeedback,
  onResetSetup,
}: SuiteSettingsRouteTreeProps) {
  return (
    <Routes>
      <Route index element={<Navigate to="/settings/general" replace />} />
      <Route
        path="general"
        element={
          <SuiteSettingsGeneral
            envelope={envelope}
            feedback={feedback}
            onEnvelopeUpdate={onEnvelopeUpdate}
            onFeedback={onFeedback}
          />
        }
      />
      <Route
        path="runtime"
        element={<SuiteSettingsRuntime envelope={envelope} />}
      />
      <Route
        path="data"
        element={
          <SuiteSettingsData
            products={envelope.products}
            feedback={feedback}
            busy={busy}
            onResetSetup={onResetSetup}
          />
        }
      />
      <Route path="cats" element={<Navigate to="/chat/settings/cats" replace />} />
      <Route path="*" element={<Navigate to="/settings/general" replace />} />
    </Routes>
  );
}

export function SuiteSettingsRoutes({
  envelope,
  onEnvelopeUpdate,
}: SuiteSettingsRoutesProps) {
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState('');
  const { dialog, confirm, handleClose } = useConfirmDialog();

  const onResetSetup = useCallback(async (): Promise<void> => {
    const confirmed = await confirm({
      title: 'Reset all data',
      message: 'This will erase all chats, cats, and suite settings. Continue?',
      confirmLabel: 'Reset',
    });
    if (!confirmed) {
      return;
    }

    setBusy('setup:reset');
    setFeedback('');
    try {
      const response = await fetch('/api/setup/reset', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Failed to reset setup.');
      }
      window.location.href = '/';
    } catch (error) {
      setBusy('');
      setFeedback(error instanceof Error ? error.message : 'Failed to reset setup.');
    }
  }, [confirm]);

  return (
    <>
      <SuiteSettingsRouteTree
        envelope={envelope}
        onEnvelopeUpdate={onEnvelopeUpdate}
        feedback={feedback}
        busy={busy}
        onFeedback={setFeedback}
        onResetSetup={() => void onResetSetup()}
      />
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
    </>
  );
}
