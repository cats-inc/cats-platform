import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
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
  completeRuntimeSessionPolicy,
  resolveCreateRuntimeSessionPolicy,
  resolveDraftPermissionModeFromRuntimeAccess,
  resolveRuntimePermissionPolicyFromDraft,
  type RuntimeSessionPolicy,
} from '../../../../shared/runtimeSessionPolicy.js';

export const NEW_CODE_DRAFT_COPY: WorkspaceNewChatDraftCopy = {
  greeting: 'Ready to code.',
  composer: {
    placeholder: 'What should this code session build, fix, or investigate?',
  },
  sidePanel: {
    title: 'New Code Setup',
  },
  participants: {
    sectionTitle: 'Participants',
    emptyState: 'No participants available yet.',
  },
  execution: {
    sectionTitle: 'Execution',
    actionLabel: 'Choose execution target',
    emptyState: 'No execution target set yet.',
  },
  folder: {
    sectionTitle: 'Workspace',
    actionLabel: 'Choose workspace',
    emptyState: 'No workspace selected yet.',
  },
};

export const NEW_CODE_CHAT_DRAFT_SIDE_PANEL_COPY: ChatNewChatDraftSidePanelCopy = {
  title: NEW_CODE_DRAFT_COPY.sidePanel?.title,
  participants: {
    catsSectionTitle: NEW_CODE_DRAFT_COPY.participants?.sectionTitle,
    groupSectionTitle: NEW_CODE_DRAFT_COPY.participants?.sectionTitle,
    emptyState: NEW_CODE_DRAFT_COPY.participants?.emptyState,
  },
  execution: {
    sectionTitle: NEW_CODE_DRAFT_COPY.execution?.sectionTitle,
    emptyState: NEW_CODE_DRAFT_COPY.execution?.emptyState,
  },
  folder: {
    sectionTitle: NEW_CODE_DRAFT_COPY.folder?.sectionTitle,
    emptyState: NEW_CODE_DRAFT_COPY.folder?.emptyState,
  },
};

function formatCodeSessionWorkspace(policy: RuntimeSessionPolicy): string {
  if (policy.workspaceKind === 'worktree') return 'Independent worktree';
  if (policy.workspaceKind === 'source') return 'Current folder';
  return 'Sandbox';
}

function formatCodeSessionPermission(policy: RuntimeSessionPolicy): string {
  return policy.workspaceAccess === 'read_only' ? 'Read only' : 'Full access';
}

export function buildCodeNewChatDraftSessionProfileSection(
  input: BuildChatNewChatDraftSidePanelSectionsInput,
): SidePanelSection {
  const currentSessionPolicy = resolveCreateRuntimeSessionPolicy({
    repoPath: input.draftCwd,
    policy: input.draftRuntimeSessionPolicy,
  });

  return {
    id: 'code:session-profile',
    title: 'Session Profile',
    children: (
      <div className="sidePanelSectionStack">
        <p className="operatorEmptyState" style={{ margin: 0 }}>
          This code session starts with {formatCodeSessionWorkspace(currentSessionPolicy)} and{' '}
          {formatCodeSessionPermission(currentSessionPolicy)}.
        </p>
        <div className="chipRow">
          <span className="composerBranchChip">
            <span>{formatCodeSessionWorkspace(currentSessionPolicy)}</span>
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
): SidePanelSection[] {
  const sections = buildChatNewChatDraftSidePanelSections({
    ...input,
    sidePanelCopy: NEW_CODE_CHAT_DRAFT_SIDE_PANEL_COPY,
  });
  const sessionProfileSection = buildCodeNewChatDraftSessionProfileSection(input);
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

export type {
  NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';

function resolveCodeDraftHelperChips(props: NewChatDraftProps): Array<{
  id: string;
  label: string;
  prompt: string;
}> {
  return (props.payload.guideCatAssist?.codeNewDraft?.bundle.content.entryChips ?? [])
    .filter((chip) => chip.prompt.trim().length > 0)
    .slice(0, 3)
    .map((chip) => ({
      id: chip.id,
      label: chip.label?.trim() || chip.prompt,
      prompt: chip.prompt,
    }));
}

function resolveCodeDraftGreeting(props: NewChatDraftProps): string | undefined {
  const assistGreeting = props.payload.guideCatAssist?.codeNewDraft?.bundle.content.greeting?.trim();
  if (assistGreeting) return assistGreeting;
  if (props.greeting && props.greeting.trim().length > 0) return props.greeting;
  return NEW_CODE_DRAFT_COPY.greeting;
}

function buildWorkspaceDraftProps(input: {
  props: NewChatDraftProps;
  visibleHelperChips: Array<{
    id: string;
    label?: string | null;
    prompt: string;
  }>;
  onSelectHelperChip: (prompt: string) => void;
}): WorkspaceDraftProps {
  const { props, visibleHelperChips, onSelectHelperChip } = input;
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
    greeting: resolveCodeDraftGreeting(props) ?? undefined,
    postComposerAccessory: visibleHelperChips.length > 0 ? (
      <div className="draftPromptSuggestions">
        <div className="chipRow">
          {visibleHelperChips.map((chip) => (
            <button
              key={chip.id}
              className="promptChip draftPromptChip"
              type="button"
              disabled={isSubmittingFirstTurn}
              onClick={() => onSelectHelperChip(chip.prompt)}
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
  const helperChips = resolveCodeDraftHelperChips(props);
  const { permissionChip, whereExtras } = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });
  const workspaceProps = buildWorkspaceDraftProps({
    props,
    visibleHelperChips: helperChips,
    onSelectHelperChip: (prompt) => { props.onComposerChange(prompt); },
  });

  return (
    <WorkspaceNewChatDraft
      {...workspaceProps}
      copy={NEW_CODE_DRAFT_COPY}
      composerHeaderAccessory={permissionChip}
      composerHeaderWhereExtras={whereExtras}
      surfaceTag={<ComposerSurfaceChip surface="code" />}
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
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'code',
  );
  const helperChips = resolveCodeDraftHelperChips(props);
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
  const codeGreeting = resolveCodeDraftGreeting(props);

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
              onClick: () => { props.onComposerChange(chip.prompt); },
            }))
          : undefined,
      }}
      draftChrome={{
        headerAccessory: permissionChip,
        headerWhereExtras: whereExtras,
        surfaceTag: <ComposerSurfaceChip surface="code" />,
      }}
      draftCopy={{
        composerPlaceholder: NEW_CODE_DRAFT_COPY.composer?.placeholder,
        folderActionLabel: NEW_CODE_DRAFT_COPY.folder?.actionLabel,
      }}
      sidePanel={{
        title: NEW_CODE_DRAFT_COPY.sidePanel?.title,
        buildSections: buildCodeNewChatDraftSidePanelSections,
      }}
      builderControls={builderControls}
    />
  );
}

export function NewChatDraft(props: NewChatDraftProps) {
  if (props.draftDefaultRecipientCatId) {
    return <CodeDirectLaneDraft {...props} />;
  }
  return <CodeChatDraft {...props} />;
}
