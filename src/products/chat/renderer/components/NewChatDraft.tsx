import { useState, type ReactNode } from 'react';

import {
  NewChatDraft as SharedChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import {
  ComposerModeChip,
  type ComposerMode,
} from '../../../shared/renderer/components/ComposerModeChip.js';
import {
  DEFAULT_PERMISSION_MODE,
  PermissionModeChip,
} from '../../../shared/renderer/components/PermissionModeChip.js';
import { resolveDraftPermissionModeFromRuntimeAccess } from '../../../../shared/runtimeSessionPolicy.js';

export type { NewChatDraftProps };

const POMODORO_PROMPT = 'Write a small pomodoro timer app.';

// Chat's draft composer mirrors the active-composer behaviour added in
// 9a8695b4: when the user has selected a cwd, show a disabled
// PermissionModeChip beneath the composer so the effective permission
// mode is visible in both the draft and active phases. The chip is
// read-only because Chat's permission mode is governed by the boss cat
// / runtime, not a free-form draft toggle (Code is where the user
// authors the policy directly).
export function NewChatDraft(props: NewChatDraftProps) {
  const [draftMode, setDraftMode] = useState<ComposerMode>('chat');

  const modeTag: ReactNode = draftMode !== 'chat' ? (
    <ComposerModeChip mode={draftMode} onDismiss={() => setDraftMode('chat')} />
  ) : null;

  const leadingStarterChips = [
    {
      id: 'pomodoro-app',
      label: 'Pomodoro app',
      onClick: () => {
        props.onComposerChange(POMODORO_PROMPT);
        setDraftMode('code');
      },
    },
  ];

  return (
    <SharedChatNewChatDraft
      {...props}
      composerHeaderAccessory={buildDraftPermissionChip(props)}
      modeTag={modeTag}
      leadingStarterChips={leadingStarterChips}
    />
  );
}

function buildDraftPermissionChip(props: NewChatDraftProps): ReactNode {
  if (!props.draftCwd) {
    return null;
  }
  const workspaceAccess = props.draftRuntimeSessionPolicy?.workspaceAccess ?? null;
  const mode = workspaceAccess
    ? resolveDraftPermissionModeFromRuntimeAccess(workspaceAccess)
    : DEFAULT_PERMISSION_MODE;
  return <PermissionModeChip value={mode} onChange={() => {}} disabled />;
}
