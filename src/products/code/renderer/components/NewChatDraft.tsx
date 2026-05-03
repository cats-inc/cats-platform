import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps as SharedNewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import { prefetchCrossSurfaceNavigationTarget } from '../../../shared/renderer/crossSurfaceNavigationRegistry.js';

export interface NewChatDraftProps extends SharedNewChatDraftProps {
  draftSurface: PlatformSurfaceId;
  onDraftSurfaceChange: (surface: PlatformSurfaceId) => void;
}
import {
  buildChatNewChatDraftSidePanelSections,
  type BuildChatNewChatDraftSidePanelSectionsInput,
  type ChatNewChatDraftSidePanelCopy,
} from '../../../shared/renderer/components/chatNewChatDraftSidePanel.js';
import type { SidePanelSection } from '../../../../design/components/SidePanel.js';
import {
  NewChatDraft as WorkspaceNewChatDraft,
  type NewChatDraftProps as WorkspaceDraftProps,
  type WorkspaceNewChatDraftCopy,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import { PermissionModeChip } from '../../../shared/renderer/components/PermissionModeChip.js';
import { useDraftSessionChips } from '../../../shared/renderer/hooks/useDraftSessionChips.js';
import { isAdvancedDraftControlsEnabled } from '../../../shared/advancedDraftControls.js';
import { resolveChatNewChatDraftBuilderControls } from '../../../shared/renderer/draftBuilderControls.js';
import { isComposerBusyForDraft } from '../../../../shared/composer.js';
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

type CodeDraftTranslate = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultCodeDraftTranslator = createTranslator('en');

export function buildNewCodeDraftCopy(
  t: CodeDraftTranslate = defaultCodeDraftTranslator,
): WorkspaceNewChatDraftCopy {
  return {
    greeting: t(messageKeys.codeNewDraftGreeting),
    composer: {
      placeholder: t(messageKeys.codeNewDraftComposerPlaceholder),
    },
    sidePanel: {
      title: t(messageKeys.codeNewDraftSetupTitle),
    },
    participants: {
      sectionTitle: t(messageKeys.codeNewDraftParticipantsTitle),
      emptyState: t(messageKeys.codeNewDraftParticipantsEmpty),
    },
    execution: {
      sectionTitle: t(messageKeys.codeNewDraftExecutionTitle),
      actionLabel: t(messageKeys.codeNewDraftExecutionAction),
      emptyState: t(messageKeys.codeNewDraftExecutionEmpty),
    },
    folder: {
      sectionTitle: t(messageKeys.codeNewDraftFolderTitle),
      actionLabel: t(messageKeys.codeNewDraftFolderAction),
      emptyState: t(messageKeys.codeNewDraftFolderEmpty),
    },
  };
}

export function buildNewCodeChatDraftSidePanelCopy(
  draftCopy: WorkspaceNewChatDraftCopy,
): ChatNewChatDraftSidePanelCopy {
  return {
    title: draftCopy.sidePanel?.title,
    participants: {
      catsSectionTitle: draftCopy.participants?.sectionTitle,
      groupSectionTitle: draftCopy.participants?.sectionTitle,
      emptyState: draftCopy.participants?.emptyState,
    },
    execution: {
      sectionTitle: draftCopy.execution?.sectionTitle,
      emptyState: draftCopy.execution?.emptyState,
    },
    folder: {
      sectionTitle: draftCopy.folder?.sectionTitle,
      emptyState: draftCopy.folder?.emptyState,
    },
  };
}

export const NEW_CODE_DRAFT_COPY: WorkspaceNewChatDraftCopy =
  buildNewCodeDraftCopy(defaultCodeDraftTranslator);

export const NEW_CODE_CHAT_DRAFT_SIDE_PANEL_COPY: ChatNewChatDraftSidePanelCopy =
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
  input: BuildChatNewChatDraftSidePanelSectionsInput,
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
  input: BuildChatNewChatDraftSidePanelSectionsInput,
  t: CodeDraftTranslate = defaultCodeDraftTranslator,
): SidePanelSection[] {
  const draftCopy = buildNewCodeDraftCopy(t);
  const sections = buildChatNewChatDraftSidePanelSections({
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

export type CodeNewChatDraftSurfaceKind = 'direct-lane' | 'default' | 'team' | 'peer';

export function resolveCodeNewChatDraftSurfaceKind(input: {
  draftDefaultRecipientCatId: string | null;
  entryPreset?: NewChatDraftProps['entryPreset'];
}): CodeNewChatDraftSurfaceKind {
  if (input.draftDefaultRecipientCatId) {
    return 'direct-lane';
  }
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
const CODE_HELPER_CHIP_LIMIT = 5;

const CODE_HELPER_CHIP_COPY_BY_ID: Record<
  string,
  {
    labelKey: MessageKey;
    promptKey: MessageKey;
  }
> = {
  'code-pomodoro': {
    labelKey: messageKeys.codeNewDraftStarterPomodoroLabel,
    promptKey: messageKeys.codeNewDraftStarterPomodoroPrompt,
  },
  'code-fix-bug': {
    labelKey: messageKeys.codeNewDraftStarterFixBugLabel,
    promptKey: messageKeys.codeNewDraftStarterFixBugPrompt,
  },
  'code-refactor': {
    labelKey: messageKeys.codeNewDraftStarterRefactorLabel,
    promptKey: messageKeys.codeNewDraftStarterRefactorPrompt,
  },
  'code-write-tests': {
    labelKey: messageKeys.codeNewDraftStarterWriteTestsLabel,
    promptKey: messageKeys.codeNewDraftStarterWriteTestsPrompt,
  },
  'cross:work:start-project': {
    labelKey: messageKeys.codeNewDraftStarterStartProjectLabel,
    promptKey: messageKeys.codeNewDraftStarterStartProjectPrompt,
  },
};

function resolveCodeDraftHelperChips(
  props: NewChatDraftProps,
  t?: CodeDraftTranslate,
): Array<{
  id: string;
  label: string;
  prompt: string;
}> {
  const translate = t;
  return (props.payload.guideCatAssist?.codeNewDraft?.bundle.content.entryChips ?? [])
    .filter((chip) => chip.prompt.trim().length > 0)
    .slice(0, CODE_HELPER_CHIP_LIMIT)
    .map((chip) => {
      const localizedCopy = translate ? CODE_HELPER_CHIP_COPY_BY_ID[chip.id] : null;
      if (localizedCopy && translate) {
        return {
          id: chip.id,
          label: translate(localizedCopy.labelKey),
          prompt: translate(localizedCopy.promptKey),
        };
      }
      return {
        id: chip.id,
        label: chip.label?.trim() || chip.prompt,
        prompt: chip.prompt,
      };
    });
}

// Chip IDs prefixed with `cross:work:` (or `cross:chat:`) hand off to the
// matching draft surface instead of staying on Code. Today only the Code
// → Work pomodoro/start-a-project handoff is wired; future cross-surface
// chips can extend the prefix scheme without changing the renderer.
const CROSS_SURFACE_CHIP_PREFIX = 'cross:';

function resolveCrossSurfaceChipTarget(chipId: string): PlatformSurfaceId | null {
  if (!chipId.startsWith(CROSS_SURFACE_CHIP_PREFIX)) return null;
  const rest = chipId.slice(CROSS_SURFACE_CHIP_PREFIX.length);
  const colon = rest.indexOf(':');
  const surface = colon >= 0 ? rest.slice(0, colon) : rest;
  if (surface === 'chat' || surface === 'work' || surface === 'code') {
    return surface;
  }
  return null;
}

function buildCodeChipOnClick(
  chip: { id: string; prompt: string },
  props: NewChatDraftProps,
): () => void {
  const target = resolveCrossSurfaceChipTarget(chip.id);
  if (target && target !== 'code') {
    return () => {
      props.onComposerChange(chip.prompt);
      void prefetchCrossSurfaceNavigationTarget(target);
      props.onDraftSurfaceChange(target);
    };
  }
  // Home-surface chip: explicitly reset draftSurface back to 'code'.
  // Without this, picking "Build a pomodoro app" after the user already
  // crossed to Work via "Start a project" leaves draftSurface stuck on
  // 'work' so the composer chip never returns to Code.
  return () => {
    props.onComposerChange(chip.prompt);
    if (props.draftSurface !== 'code') {
      props.onDraftSurfaceChange('code');
    }
  };
}

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

function resolveCodeDraftGreeting(
  props: NewChatDraftProps,
  draftCopy: WorkspaceNewChatDraftCopy,
): string | undefined {
  const assistGreeting = props.payload.guideCatAssist?.codeNewDraft?.bundle.content.greeting?.trim();
  if (assistGreeting) return assistGreeting;
  if (props.greeting && props.greeting.trim().length > 0) return props.greeting;
  return draftCopy.greeting;
}

function buildWorkspaceDraftProps(input: {
  props: NewChatDraftProps;
  draftCopy: WorkspaceNewChatDraftCopy;
  visibleHelperChips: Array<{
    id: string;
    label?: string | null;
    prompt: string;
  }>;
  onSelectHelperChip: (chip: { id: string; prompt: string }) => void;
}): WorkspaceDraftProps {
  const { props, draftCopy, visibleHelperChips, onSelectHelperChip } = input;
  const {
    greetingPool,
    draftTemporaryParticipants,
    onAddDraftTemporaryParticipant,
    onQuickAddDraftTemporaryParticipant,
    onRemoveDraftTemporaryParticipant,
    onUpdateDraftTemporaryParticipant,
    entryPreset,
    parallelTargets,
    onParallelTargetChange,
    onAddParallelTarget,
    onRemoveParallelTarget,
    draftWorkflowShape,
    onToggleDraftWorkflowShape,
    draftAudienceKeys,
    onSetAudienceKeys,
    draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange,
    onCancelPendingSend,
    builderControls,
    sidePanel,
    ...workspaceProps
  } = props;
  const isSubmittingFirstTurn = isComposerBusyForDraft(props.busy);

  // Direct-lane +New Code still renders the workspace draft surface
  // (profile header + ComposerCatStack). It intentionally ignores
  // the chat-group / parallel draft fields — those live in the
  // ChatNewChatDraft path for group / parallel presets.
  void greetingPool;
  void draftTemporaryParticipants;
  void onAddDraftTemporaryParticipant;
  void onQuickAddDraftTemporaryParticipant;
  void onRemoveDraftTemporaryParticipant;
  void onUpdateDraftTemporaryParticipant;
  void entryPreset;
  void parallelTargets;
  void onParallelTargetChange;
  void onAddParallelTarget;
  void onRemoveParallelTarget;
  void draftWorkflowShape;
  void onToggleDraftWorkflowShape;
  void draftAudienceKeys;
  void onSetAudienceKeys;
  void draftRuntimeSessionPolicy;
  void onDraftRuntimeSessionPolicyChange;
  void onCancelPendingSend;
  void builderControls;
  void sidePanel;

  return {
    ...workspaceProps,
    greeting: resolveCodeDraftGreeting(props, draftCopy) ?? undefined,
    postComposerAccessory: visibleHelperChips.length > 0 ? (
      <div className="draftPromptSuggestions">
        <div className="chipRow">
          {visibleHelperChips.map((chip) => (
            <button
              key={chip.id}
              className="promptChip draftPromptChip"
              type="button"
              disabled={isSubmittingFirstTurn}
              onClick={() => onSelectHelperChip({ id: chip.id, prompt: chip.prompt })}
            >
              {chip.label?.trim() || chip.prompt}
            </button>
          ))}
        </div>
      </div>
    ) : null,
  };
}

/**
 * Direct-lane drafts (`draftDefaultRecipientCatId` present) keep the
 * workspace draft surface so the profile header + ComposerCatStack
 * stay intact. Teaching +collaborate / +compare are suppressed here
 * because direct-lane is a 1×1 context.
 */
function CodeDirectLaneDraft(props: NewChatDraftProps) {
  const { t } = useI18n();
  const draftCopy = buildNewCodeDraftCopy(t);
  const helperChips = resolveCodeDraftHelperChips(props, t);
  const { permissionChip, whereExtras } = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });
  const workspaceProps = buildWorkspaceDraftProps({
    props,
    draftCopy,
    visibleHelperChips: helperChips,
    onSelectHelperChip: (chip) => buildCodeChipOnClick(chip, props)(),
  });

  return (
    <WorkspaceNewChatDraft
      {...workspaceProps}
      copy={draftCopy}
      composerHeaderAccessory={permissionChip}
      composerHeaderWhereExtras={whereExtras}
      surfaceTag={buildCodeSurfaceTag(props)}
    />
  );
}

/**
 * Generic +New Code (no direct-lane recipient), +Team Code, and
 * +Peer Code all render through `ChatNewChatDraft` so +collaborate
 * seeds temps in place and +compare appends a shadow row without
 * navigating off the current URL — matching +New Chat.
 */
function CodeChatDraft(props: NewChatDraftProps) {
  const { t } = useI18n();
  const draftCopy = buildNewCodeDraftCopy(t);
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'code',
  );
  const helperChips = resolveCodeDraftHelperChips(props, t);
  const { permissionChip, whereExtras } = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });
  const builderControls = resolveChatNewChatDraftBuilderControls({
    advancedDraftControlsEnabled,
    entryPreset: props.entryPreset ?? 'default',
    showStructuredDraftControls: true,
    hasVisibleParallelDraftTargets: (props.parallelTargets?.length ?? 0) > 1,
  });
  const codeGreeting = resolveCodeDraftGreeting(props, draftCopy);

  return (
    <ChatNewChatDraft
      {...props}
      greeting={codeGreeting}
      starterChips={{
        preserveOnSelect: true,
        leading: helperChips.length > 0
          ? helperChips.map((chip) => ({
              id: chip.id,
              label: chip.label,
              onClick: buildCodeChipOnClick(chip, props),
            }))
          : undefined,
      }}
      draftChrome={{
        headerAccessory: permissionChip,
        headerWhereExtras: whereExtras,
        surfaceTag: buildCodeSurfaceTag(props),
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
    draftDefaultRecipientCatId: props.draftDefaultRecipientCatId,
    entryPreset: props.entryPreset,
  });
  if (surfaceKind === 'direct-lane') {
    return <CodeDirectLaneDraft {...props} />;
  }
  if (surfaceKind === 'team') {
    return <CodeTeamDraft {...props} />;
  }
  if (surfaceKind === 'peer') {
    return <CodePeerDraft {...props} />;
  }
  return <CodeDefaultDraft {...props} />;
}
