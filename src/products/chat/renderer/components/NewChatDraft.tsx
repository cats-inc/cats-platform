import { type ReactNode } from 'react';

import {
  NewChatDraft as SharedChatNewChatDraft,
  type NewChatDraftProps as SharedNewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import {
  DEFAULT_PERMISSION_MODE,
  PermissionModeChip,
} from '../../../shared/renderer/components/PermissionModeChip.js';
import { useDraftSessionChips } from '../../../shared/renderer/hooks/useDraftSessionChips.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import { resolveDraftPermissionModeFromRuntimeAccess } from '../../../../shared/runtimeSessionPolicy.js';
import { prefetchCrossSurfaceNavigationTarget } from '../../../shared/renderer/crossSurfaceNavigationRegistry.js';

export interface NewChatDraftProps extends SharedNewChatDraftProps {
  draftSurface: PlatformSurfaceId;
  onDraftSurfaceChange: (surface: PlatformSurfaceId) => void;
}

const POMODORO_PROMPT = 'Write a small pomodoro timer app.';

export function NewChatDraft(props: NewChatDraftProps) {
  // Reset per-draft UI state (folder probe, starter visibility, ...) when the
  // route identity changes so switching between +New chat, +Group,
  // +Parallel, cat-led, and direct-lane drafts does not leak across entries.
  const draftKey = [
    props.entryPreset ?? 'default',
    (props.allowAddCat ?? true) ? 'public' : 'direct',
    props.draftDefaultRecipientCatId ?? 'none',
  ].join(':');
  return <NewChatDraftInner key={draftKey} {...props} />;
}

function NewChatDraftInner(props: NewChatDraftProps) {
  const codeChips = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });

  const isCodeSurface = props.draftSurface === 'code';

  const surfaceTag: ReactNode = props.draftSurface !== 'chat' ? (
    <ComposerSurfaceChip
      surface={props.draftSurface}
      onDismiss={() => props.onDraftSurfaceChange('chat')}
    />
  ) : null;

  const isDirectLaneDraft = !(props.allowAddCat ?? true) && Boolean(props.draftDefaultRecipientCatId);
  const isParallelDraft = (props.parallelTargets?.length ?? 0) >= 2;
  const entryPreset = props.entryPreset ?? 'default';
  // The hard-coded "Pomodoro app" chip only belongs on the default
  // single-chat draft. Group / parallel entries (and any default draft
  // that has been expanded to multiple parallel targets) surface their
  // chips through runtime-backed `newChatAssist` content via the
  // shared composer's `visibleStarterSuggestions`, not via this
  // chat-product fallback. Including those entries here previously
  // leaked the Pomodoro chip into surfaces that should stay clean.
  // The shared composer additionally hides this fallback whenever a
  // runtime starter suggestion list is non-empty (see helperRegion in
  // ChatNewChatDraft.tsx), so a +New draft expanded to a group with
  // runtime assist content does not show both chip sources at once.
  const showsChatStarterChip =
    !isDirectLaneDraft
    && entryPreset === 'default'
    && !isParallelDraft;

  const leadingStarterChips = showsChatStarterChip
    ? [
      {
        id: 'pomodoro-app',
        label: 'Pomodoro app',
        onClick: () => {
          props.onComposerChange(POMODORO_PROMPT);
          void prefetchCrossSurfaceNavigationTarget('code');
          props.onDraftSurfaceChange('code');
        },
      },
    ]
    : [];

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
