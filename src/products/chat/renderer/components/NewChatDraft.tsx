import { useState, type ReactNode } from 'react';

import {
  NewChatDraft as SharedChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import {
  DEFAULT_PERMISSION_MODE,
  PermissionModeChip,
} from '../../../shared/renderer/components/PermissionModeChip.js';
import { useDraftSessionChips } from '../../../shared/renderer/hooks/useDraftSessionChips.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import { resolveDraftPermissionModeFromRuntimeAccess } from '../../../../shared/runtimeSessionPolicy.js';

export type { NewChatDraftProps };

const POMODORO_PROMPT = 'Write a small pomodoro timer app.';

export function NewChatDraft(props: NewChatDraftProps) {
  const [draftSurface, setDraftSurface] = useState<PlatformSurfaceId>('chat');
  const codeChips = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });

  const isCodeSurface = draftSurface === 'code';

  const surfaceTag: ReactNode = draftSurface !== 'chat' ? (
    <ComposerSurfaceChip surface={draftSurface} onDismiss={() => setDraftSurface('chat')} />
  ) : null;

  const leadingStarterChips = [
    {
      id: 'pomodoro-app',
      label: 'Pomodoro app',
      onClick: () => {
        props.onComposerChange(POMODORO_PROMPT);
        setDraftSurface('code');
      },
    },
  ];

  const composerHeaderAccessory = isCodeSurface
    ? codeChips.permissionChip
    : buildChatPermissionChip(props);
  const composerHeaderWhereExtras = isCodeSurface ? codeChips.whereExtras : null;
  const chooseFolderPlacement = isCodeSurface ? 'header' : 'plusMenu';
  const folderActionLabel = isCodeSurface ? 'Choose workspace' : 'Choose folder';

  return (
    <SharedChatNewChatDraft
      {...props}
      composerHeaderAccessory={composerHeaderAccessory}
      composerHeaderWhereExtras={composerHeaderWhereExtras}
      surfaceTag={surfaceTag}
      chooseFolderPlacement={chooseFolderPlacement}
      folderActionLabel={folderActionLabel}
      leadingStarterChips={leadingStarterChips}
    />
  );
}

// Chat@chat: when the user has selected a cwd, show a disabled
// PermissionModeChip so the effective permission mode is visible.
// The chip is read-only because Chat's permission mode is governed
// by the boss cat / runtime, not a free-form draft toggle (Code is
// where the user authors the policy directly).
function buildChatPermissionChip(props: NewChatDraftProps): ReactNode {
  if (!props.draftCwd) {
    return null;
  }
  const workspaceAccess = props.draftRuntimeSessionPolicy?.workspaceAccess ?? null;
  const mode = workspaceAccess
    ? resolveDraftPermissionModeFromRuntimeAccess(workspaceAccess)
    : DEFAULT_PERMISSION_MODE;
  return <PermissionModeChip value={mode} onChange={() => {}} disabled />;
}
