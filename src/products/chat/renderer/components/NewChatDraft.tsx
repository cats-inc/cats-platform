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
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

export interface NewChatDraftProps extends SharedNewChatDraftProps {
  draftSurface: PlatformSurfaceId;
  onDraftSurfaceChange: (surface: PlatformSurfaceId) => void;
}

export function NewChatDraft(props: NewChatDraftProps) {
  // Reset per-draft UI state (folder probe, starter visibility, ...) when the
  // route identity changes so switching between +New chat, +Group,
  // +Parallel, participant, and direct-lane drafts does not leak across entries.
  const draftKey = [
    props.entryPreset ?? 'default',
    (props.allowAddCat ?? true) ? 'public' : 'direct',
    props.draftDefaultRecipientCatId ?? 'none',
  ].join(':');
  return <NewChatDraftInner key={draftKey} {...props} />;
}

function NewChatDraftInner(props: NewChatDraftProps) {
  const { t } = useI18n();
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
  const entryPreset = props.entryPreset ?? 'default';
  // Chat owns the cross-surface "Pomodoro app" affordance for the three
  // fresh entry routes (+New / +Group / +Parallel). Behaviour is symmetric
  // across them: clicking +compare from any of the three keeps the chip
  // (it just adds another branch — not a mode change). Direct-lane drafts
  // remain excluded because that surface owns its private cat-led flow.
  // Runtime-backed `newChatAssist` chips still take precedence inside the
  // shared composer helperRegion, so this fallback only renders when the
  // route has no runtime chip source.
  const showsChatStarterChip =
    !isDirectLaneDraft
    && (
      entryPreset === 'group'
      || entryPreset === 'parallel'
      || entryPreset === 'default'
    );

  const leadingStarterChips = showsChatStarterChip
    ? [
      {
        id: 'pomodoro-app',
        label: t(messageKeys.chatNewChatDraftPomodoroChipLabel),
        onClick: () => {
          props.onComposerChange(t(messageKeys.chatNewChatDraftPomodoroPrompt));
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
  const folderActionLabel = isCodeSurface
    ? t(messageKeys.chatNewChatDraftChooseCodespaceActionLabel)
    : t(messageKeys.chatNewChatDraftFolderActionLabel);

  return (
    <SharedChatNewChatDraft
      {...props}
      draftChrome={{
        headerAccessory: composerHeaderAccessory,
        headerWhereExtras: composerHeaderWhereExtras,
        surfaceTag,
        chooseFolderPlacement,
      }}
      draftCopy={{
        folderActionLabel,
      }}
      starterChips={{
        leading: leadingStarterChips,
      }}
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
