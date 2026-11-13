import { useEffect, useRef } from 'react';

import type { ShowToast } from '../../../../design/components/Toast.js';
import { resolveWorkspaceFeedbackDelivery } from '../workspaceFeedbackDelivery.js';

export const WORKSPACE_FEEDBACK_TOAST_KEY = 'workspace-feedback';

/** Shows workspace `feedback` as one error toast that follows the state (workspaceFeedbackDelivery.ts). */
export function useWorkspaceFeedbackToast(input: {
  feedback: string;
  setFeedback: (value: string) => void;
  /** The Add cat panel is on screen and renders `feedback` itself. */
  shownInline: boolean;
  showToast: ShowToast;
  dismissToast: (key: string) => void;
}): void {
  const { feedback, setFeedback, shownInline, showToast, dismissToast } = input;
  const heldInlineRef = useRef('');
  useEffect(() => {
    const delivery = resolveWorkspaceFeedbackDelivery({ feedback, shownInline, heldInline: heldInlineRef.current });
    heldInlineRef.current = delivery.heldInline;
    if (delivery.toast) {
      showToast(delivery.toast, {
        level: 'error',
        key: WORKSPACE_FEEDBACK_TOAST_KEY,
        onDismiss: () => setFeedback(''),
      });
    } else {
      dismissToast(WORKSPACE_FEEDBACK_TOAST_KEY);
    }
  }, [feedback, shownInline, showToast, dismissToast, setFeedback]);
}
