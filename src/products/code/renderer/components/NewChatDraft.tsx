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
import type { WorkspaceNewChatDraftCopy } from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import { PermissionModeChip } from '../../../shared/renderer/components/PermissionModeChip.js';
import { useDraftSessionChips } from '../../../shared/renderer/hooks/useDraftSessionChips.js';
import { isAdvancedDraftControlsEnabled } from '../../../shared/advancedDraftControls.js';
import { resolveChatNewChatDraftBuilderControls } from '../../../shared/renderer/draftBuilderControls.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import { resolveGuideCatAssistGreeting } from '../../../../shared/guideCatAssistPresentation.js';
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
  t: CodeDraftTranslate,
): string | undefined {
  const assistGreeting = resolveGuideCatAssistGreeting(
    props.payload.guideCatAssist?.codeNewDraft,
    t,
  );
  if (assistGreeting) return assistGreeting;
  if (props.greeting && props.greeting.trim().length > 0) return props.greeting;
  return draftCopy.greeting;
}

/**
 * +New Code (including a cat-scoped `/code/new?cat=<id>`), +Team Code,
 * and +Peer Code all render through `ChatNewChatDraft` so +collaborate
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
  const codeGreeting = resolveCodeDraftGreeting(props, draftCopy, t);
  const selectedCatId = props.draftDefaultRecipientCatId ?? props.draftCatIds[0];
  const selectedCat = props.payload.chat.cats.find((cat) => cat.id === selectedCatId);
  const helpTarget = selectedCat
    ? props.draftCatExecutionTargetOverrides.get(selectedCat.id) ?? selectedCat.defaultExecutionTarget
    : props.selectedExecutionTarget;

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
