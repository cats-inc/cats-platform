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
  // Reset per-draft state (draftSurface, repo probe, ...) when the route
  // identity changes so switching between +New chat, +Group, +Parallel,
  // cat-led, and direct-lane drafts does not leak state across entries.
  const draftKey = [
    props.entryPreset ?? 'default',
    (props.allowAddCat ?? true) ? 'public' : 'direct',
    props.draftDefaultRecipientCatId ?? 'none',
  ].join(':');
  return <NewChatDraftInner key={draftKey} {...props} />;
}

function NewChatDraftInner(props: NewChatDraftProps) {
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

  const isDirectLaneDraft = !(props.allowAddCat ?? true) && Boolean(props.draftDefaultRecipientCatId);
  const isParallelDraft = (props.parallelTargets?.length ?? 0) >= 2;
  const entryPreset = props.entryPreset ?? 'default';
  const showsChatStarterChip =
    !isDirectLaneDraft
    && (
      entryPreset === 'default'
      || entryPreset === 'group'
      || entryPreset === 'parallel'
      || isParallelDraft
    );

  const leadingStarterChips = showsChatStarterChip
    ? [
      {
        id: 'pomodoro-app',
        label: 'Pomodoro app',
        onClick: () => {
          props.onComposerChange(POMODORO_PROMPT);
          // TODO(cross-surface-dispatch): setDraftSurface('code') only flips
          // local UI (ComposerSurfaceChip, WHERE header, Choose workspace).
          // Send still goes through chat's useComposerSubmit at
          //   chat/renderer/hooks/useComposerSubmit.ts (hardcoded
          //   originSurface: 'chat' at ~:310 and ~:422)
          // and lands at chat/shared/channelPaths.ts:buildChannelPath =>
          // /chat/chats/<id>, not /code/<id>. A proper fix needs:
          //   1. chat submit to detect draftSurface and dispatch to the
          //      target product's create API (not chat's createChatChannel)
          //   2. navigate to the target surface's buildChannelPath
          //   3. prefetch the target product bundle on surface switch to
          //      cover the React.lazy gap in app/renderer/App.tsx
          // Tracked in:
          //   - ADR-073: target-surface dispatch + warm cross-surface handoff
          //   - SPEC-074: cross-surface draft dispatch and warm product handoff
          //   - PLAN-066: rollout for dispatch, routing, and handoff continuity
          setDraftSurface('code');
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
