import {
  NewConversationDraft,
  type NewConversationDraftProps,
} from '../../../shared/renderer/components/NewConversationDraft.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';

export interface NewChatDraftProps extends NewConversationDraftProps {
  draftSurface: PlatformSurfaceId;
  onDraftSurfaceChange: (surface: PlatformSurfaceId) => void;
}
import {
  buildNewConversationDraftSidePanelSections,
  type BuildNewConversationDraftSidePanelSectionsInput,
  type NewConversationDraftSidePanelCopy,
} from '../../../shared/renderer/components/newConversationDraftSidePanel.js';
import type { SidePanelSection } from '../../../../design/components/SidePanel.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import { PermissionModeChip } from '../../../shared/renderer/components/PermissionModeChip.js';
import { useDraftSessionChips } from '../../../shared/renderer/hooks/useDraftSessionChips.js';
import { isAdvancedDraftControlsEnabled } from '../../../shared/advancedDraftControls.js';
import { resolveNewConversationDraftBuilderControls } from '../../../shared/renderer/draftBuilderControls.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import {
  completeRuntimeSessionPolicy,
  resolveCreateRuntimeSessionPolicy,
  resolveDraftPermissionModeFromRuntimeAccess,
  resolveRuntimePermissionPolicyFromDraft,
  type RuntimeSessionPolicy,
} from '../../../../shared/runtimeSessionPolicy.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { CodeCatlasHelp } from './CodeCatlasHelp.js';

type CodeDraftTranslate = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultCodeDraftTranslator = createTranslator('en');

/** Code-owned composer and side-panel labels; greetings come from assist content. */
export interface NewCodeDraftCopy {
  composer?: {
    placeholder?: string;
  };
  sidePanel?: {
    title?: string;
  };
  folder?: {
    sectionTitle?: string;
    actionLabel?: string;
    emptyState?: string;
  };
}

export function buildNewCodeDraftCopy(
  t: CodeDraftTranslate = defaultCodeDraftTranslator,
): NewCodeDraftCopy {
  return {
    composer: {
      placeholder: t(messageKeys.codeNewDraftComposerPlaceholder),
    },
    sidePanel: {
      title: t(messageKeys.codeNewDraftSetupTitle),
    },
    folder: {
      sectionTitle: t(messageKeys.codeNewDraftFolderTitle),
      actionLabel: t(messageKeys.codeNewDraftFolderAction),
      emptyState: t(messageKeys.codeNewDraftFolderEmpty),
    },
  };
}

export function buildNewCodeChatDraftSidePanelCopy(
  draftCopy: NewCodeDraftCopy,
): NewConversationDraftSidePanelCopy {
  return {
    title: draftCopy.sidePanel?.title,
    folder: {
      sectionTitle: draftCopy.folder?.sectionTitle,
      emptyState: draftCopy.folder?.emptyState,
    },
  };
}

export const NEW_CODE_DRAFT_COPY: NewCodeDraftCopy =
  buildNewCodeDraftCopy(defaultCodeDraftTranslator);

export const NEW_CODE_CHAT_DRAFT_SIDE_PANEL_COPY: NewConversationDraftSidePanelCopy =
  buildNewCodeChatDraftSidePanelCopy(NEW_CODE_DRAFT_COPY);

function formatCodeSessionWorkspace(
  policy: RuntimeSessionPolicy,
  t: CodeDraftTranslate,
): string {
  if (policy.workspaceKind === 'worktree') {
    return t(messageKeys.codeNewDraftWorkspaceIndependentWorktree);
  }
  if (policy.workspaceKind === 'source') {
    return t(messageKeys.codeNewDraftWorkspaceCurrentFolder);
  }
  return t(messageKeys.codeNewDraftWorkspaceSandbox);
}

function formatCodeSessionPermission(
  policy: RuntimeSessionPolicy,
  t: CodeDraftTranslate,
): string {
  return policy.workspaceAccess === 'read_only'
    ? t(messageKeys.codeNewDraftPermissionReadOnly)
    : t(messageKeys.codeNewDraftPermissionFullAccess);
}

export function buildCodeNewChatDraftSessionProfileSection(
  input: BuildNewConversationDraftSidePanelSectionsInput,
  t: CodeDraftTranslate = defaultCodeDraftTranslator,
): SidePanelSection {
  const currentSessionPolicy = resolveCreateRuntimeSessionPolicy({
    repoPath: input.draftCwd,
    policy: input.draftRuntimeSessionPolicy,
  });
  const workspaceLabel = formatCodeSessionWorkspace(currentSessionPolicy, t);
  const permissionLabel = formatCodeSessionPermission(currentSessionPolicy, t);

  return {
    id: 'code:session-profile',
    title: t(messageKeys.codeNewDraftSessionProfileTitle),
    children: (
      <div className="sidePanelSectionStack">
        <p className="operatorEmptyState" style={{ margin: 0 }}>
          {t(messageKeys.codeNewDraftSessionProfileDescription, {
            workspace: workspaceLabel,
            permission: permissionLabel,
          })}
        </p>
        <div className="chipRow">
          <span className="composerBranchChip">
            <span>{workspaceLabel}</span>
          </span>
          <PermissionModeChip
            value={resolveDraftPermissionModeFromRuntimeAccess(
              currentSessionPolicy.workspaceAccess,
            )}
            onChange={(nextMode) => {
              input.onDraftRuntimeSessionPolicyChange?.(
                completeRuntimeSessionPolicy({
                  workspaceKind: currentSessionPolicy.workspaceKind,
                  ...resolveRuntimePermissionPolicyFromDraft(nextMode),
                }),
              );
            }}
            disabled={
              input.isSubmittingFirstTurn
              || input.onDraftRuntimeSessionPolicyChange == null
            }
          />
        </div>
      </div>
    ),
  };
}

export function buildCodeNewChatDraftSidePanelSections(
  input: BuildNewConversationDraftSidePanelSectionsInput,
  t: CodeDraftTranslate = defaultCodeDraftTranslator,
): SidePanelSection[] {
  const draftCopy = buildNewCodeDraftCopy(t);
  const sections = buildNewConversationDraftSidePanelSections({
    ...input,
    t,
    sidePanelCopy: buildNewCodeChatDraftSidePanelCopy(draftCopy),
  });
  const sessionProfileSection = buildCodeNewChatDraftSessionProfileSection(input, t);
  const cwdSectionIndex = sections.findIndex((section) => section.id === 'cwd');
  if (cwdSectionIndex === -1) {
    return [...sections, sessionProfileSection];
  }
  return [
    ...sections.slice(0, cwdSectionIndex),
    sessionProfileSection,
    ...sections.slice(cwdSectionIndex),
  ];
}

export type CodeNewChatDraftSurfaceKind = 'default' | 'team' | 'peer';

export function resolveCodeNewChatDraftSurfaceKind(input: {
  entryPreset?: NewChatDraftProps['entryPreset'];
}): CodeNewChatDraftSurfaceKind {
  if (input.entryPreset === 'group') {
    return 'team';
  }
  if (input.entryPreset === 'parallel') {
    return 'peer';
  }
  return 'default';
}

// Cap at 5 to leave room for the inline "Write tests" + cross-surface
// "Start a project" affordances added on top of the original 3 baseline
// chips. Bump if the chip strip ever exceeds five.
// Surface tag follows the live `draftSurface` so a cross-surface chip
// (e.g. "Start a project" → work) immediately swaps the Code chip for a
// Work chip on the composer header. The dismiss arrow only renders when
// drafted away from Code's home surface so the user can pop back.
function buildCodeSurfaceTag(props: NewChatDraftProps) {
  return (
    <ComposerSurfaceChip
      surface={props.draftSurface}
      onDismiss={
        props.draftSurface !== 'code'
          ? () => props.onDraftSurfaceChange('code')
          : undefined
      }
    />
  );
}

/**
 * +New Code (including a cat-scoped `/code/new?cat=<id>`), +Team Code,
 * and +Peer Code all render through `NewConversationDraft` so +collaborate
 * seeds temps in place and +compare appends a shadow row without
 * navigating off the current URL — matching +New Chat. Direct messages
 * belong to Chat (ADR-129), so Code has no direct-lane draft.
 */
function CodeChatDraft(props: NewChatDraftProps) {
  const { t } = useI18n();
  const draftCopy = buildNewCodeDraftCopy(t);
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'code',
  );
  const { permissionChip, whereExtras } = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });
  const builderControls = resolveNewConversationDraftBuilderControls({
    advancedDraftControlsEnabled,
    entryPreset: props.entryPreset ?? 'default',
    showStructuredDraftControls: true,
    hasVisibleParallelDraftTargets: (props.parallelTargets?.length ?? 0) > 1,
  });
  const selectedCatId = props.draftDefaultRecipientCatId ?? props.draftCatIds[0];
  const selectedCat = props.payload.chat.cats.find((cat) => cat.id === selectedCatId);
  const helpTarget = selectedCat
    ? props.draftCatExecutionTargetOverrides.get(selectedCat.id) ?? selectedCat.defaultExecutionTarget
    : props.selectedExecutionTarget;

  return (
    <NewConversationDraft
      {...props}
      assistSurface="code"
      starterChips={{ preserveOnSelect: true }}
      draftChrome={{
        headerAccessory: permissionChip,
        headerWhereExtras: whereExtras,
        surfaceTag: buildCodeSurfaceTag(props),
        customRegion: (!props.entryPreset || props.entryPreset === 'default')
          && props.draftSurface === 'code' ? (
            <CodeCatlasHelp
              guideCat={props.payload.guideCat ?? null}
              disabled={props.payload.guideCatAssist?.codeNewDraft?.surfaceDisabled}
              draft={{
                cwd: props.draftCwd,
                target: helpTarget ? {
                  provider: helpTarget.provider,
                  instance: helpTarget.instance ?? null,
                  model: helpTarget.model ?? null,
                } : null,
                policy: resolveCreateRuntimeSessionPolicy({
                  repoPath: props.draftCwd, policy: props.draftRuntimeSessionPolicy,
                }),
              }}
            />
          ) : null,
      }}
      draftCopy={{
        composerPlaceholder: draftCopy.composer?.placeholder,
        folderActionLabel: draftCopy.folder?.actionLabel,
      }}
      sidePanel={{
        title: draftCopy.sidePanel?.title,
        buildSections: (input) => buildCodeNewChatDraftSidePanelSections(input, t),
      }}
      builderControls={builderControls}
    />
  );
}

function CodeDefaultDraft(props: NewChatDraftProps) {
  return <CodeChatDraft {...props} />;
}

function CodeTeamDraft(props: NewChatDraftProps) {
  return <CodeChatDraft {...props} />;
}

function CodePeerDraft(props: NewChatDraftProps) {
  return <CodeChatDraft {...props} />;
}

export function NewChatDraft(props: NewChatDraftProps) {
  const surfaceKind = resolveCodeNewChatDraftSurfaceKind({
    entryPreset: props.entryPreset,
  });
  if (surfaceKind === 'team') {
    return <CodeTeamDraft {...props} />;
  }
  if (surfaceKind === 'peer') {
    return <CodePeerDraft {...props} />;
  }
  return <CodeDefaultDraft {...props} />;
}
