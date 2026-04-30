import type { CSSProperties } from 'react';

import type { SidePanelSection } from '../../../../../design/components/SidePanel.js';
import { isChannelBusy } from '../../../../../shared/workspaceBusy.js';
import type { AppShellPayload, ChatCat } from '../../../api/workspaceContracts.js';
import type {
  ChatOperatorView,
  ChatRunInspectorView,
} from '../../../operator-loop/index.js';
import {
  resolveParticipantCatId,
  type ResolvedChannelParticipant,
} from '../../../channelParticipants.js';
import { openFolderInExplorer } from '../../api/index.js';
import { catInitials, type SelectedChannelView } from '../../workspaceChatUtils.js';
import { ActivityFeed } from '../ActivityFeed.js';
import { ApprovalQueuePanel } from '../ApprovalQueuePanel.js';
import {
  buildExecutionTargetSummary,
  createExecutionTargetValueFromProviderSelection,
  type ExecutionTargetValue,
} from '../../../../shared/renderer/components/ExecutionTarget.js';
import { ProgressSummaryPanel } from '../ProgressSummaryPanel.js';
import { ProviderModelFields } from '../ProviderModelFields.js';
import { RunInspector } from '../RunInspector.js';
import { ChatParticipantsSection } from './ChatParticipantsSection.js';
import type { WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

export interface BuildChatSidePanelSectionsOptions {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  busy: WorkspaceBusyState;
  operatorView: ChatOperatorView | null;
  operatorLoading: boolean;
  operatorError: string;
  assignedCatRecords: ChatCat[];
  assignedAdhocParticipants: ResolvedChannelParticipant[];
  defaultRecipientCatId: string | null;
  defaultRecipientParticipant: ResolvedChannelParticipant | null;
  directLaneCat: ChatCat | null;
  directLaneExecutionTarget: ExecutionTargetValue | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
  selectedExecutionTarget?: ExecutionTargetValue;
  inspectedRun: ChatRunInspectorView | null;
  showAddCatButton: boolean;
  editingParticipantId: string | null;
  editingParticipantName: string;
  canRenameParticipants: boolean;
  onEditingParticipantNameChange: (value: string) => void;
  onBeginParticipantRename: (participant: ResolvedChannelParticipant) => void;
  onCancelParticipantRename: () => void;
  onSubmitParticipantRename: (participantId: string) => void;
  onOpenAddCat?: () => void;
  onCloseSidePanel: () => void;
  onInspectRun: (runId: string) => void;
  onApprovalDecision: (taskId: string, action: 'approve' | 'reroute' | 'reject') => void;
  onOperatorAction: (input: {
    action: 'retry' | 'acknowledge';
    taskId?: string | null;
    runId?: string | null;
    checkpointId?: string | null;
    outcomeId?: string | null;
  }) => void;
  onExecutionTargetChange?: (value: ExecutionTargetValue) => void;
  onStartFresh?: () => void;
  onDirectLaneExecutionTargetChange?: (catId: string, value: ExecutionTargetValue) => void;
  buildParticipantAvatarStyle: (
    participant: ResolvedChannelParticipant,
    catRecord?: ChatCat | null,
  ) => CSSProperties | undefined;
}

export function buildChatSidePanelSections({
  payload,
  selectedChannel,
  busy,
  operatorView,
  operatorLoading,
  operatorError,
  assignedCatRecords,
  assignedAdhocParticipants,
  defaultRecipientCatId,
  defaultRecipientParticipant,
  directLaneCat,
  directLaneExecutionTarget,
  isDirectLane,
  isSoloComposer,
  selectedExecutionTarget,
  inspectedRun,
  showAddCatButton,
  editingParticipantId,
  editingParticipantName,
  canRenameParticipants,
  onEditingParticipantNameChange,
  onBeginParticipantRename,
  onCancelParticipantRename,
  onSubmitParticipantRename,
  onOpenAddCat,
  onCloseSidePanel,
  onInspectRun,
  onApprovalDecision,
  onOperatorAction,
  onExecutionTargetChange,
  onStartFresh,
  onDirectLaneExecutionTargetChange,
  buildParticipantAvatarStyle,
}: BuildChatSidePanelSectionsOptions): SidePanelSection[] {
  const { t } = useI18n();
  const sections: SidePanelSection[] = [];
  const startFreshBusy = isChannelBusy(busy, 'reset');

  if (showAddCatButton || assignedCatRecords.length > 0 || assignedAdhocParticipants.length > 0) {
    sections.push({
      id: 'cats',
      title: assignedAdhocParticipants.length > 0
        ? t(messageKeys.chatNewChatDraftSidePanelParticipantsGroupTitle)
        : t(messageKeys.chatNewChatDraftSidePanelParticipantsCatsTitle),
      children: (
        <ChatParticipantsSection
          assignedCatRecords={assignedCatRecords}
          assignedAdhocParticipants={assignedAdhocParticipants}
          bossCatId={payload.chat.bossCatId}
          defaultRecipientCatId={defaultRecipientCatId}
          editingParticipantId={editingParticipantId}
          editingParticipantName={editingParticipantName}
          busy={busy}
          canRenameParticipants={canRenameParticipants}
          showAddCatButton={showAddCatButton}
          onEditingParticipantNameChange={onEditingParticipantNameChange}
          onBeginParticipantRename={onBeginParticipantRename}
          onCancelParticipantRename={onCancelParticipantRename}
          onSubmitParticipantRename={onSubmitParticipantRename}
          onOpenAddCat={onOpenAddCat}
          onCloseSidePanel={onCloseSidePanel}
        />
      ),
    });
  }

  const executionChildren = (() => {
    if (isDirectLane && directLaneCat && directLaneExecutionTarget) {
      return (
        <>
          <div className="sidePanelSectionStack">
            <div className="catInspectIdentity">
              <div
                className={directLaneCat.id === payload.chat.bossCatId ? 'catAvatar catAvatarBoss catInspectAvatar' : 'catAvatar catInspectAvatar'}
                style={directLaneCat.avatarUrl
                  ? { backgroundImage: `url(${directLaneCat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : directLaneCat.avatarColor ? { background: directLaneCat.avatarColor } : undefined}
              >
                {directLaneCat.avatarUrl ? null : catInitials(directLaneCat.name)}
              </div>
              <div>
                <strong>{directLaneCat.name}</strong>
                {directLaneCat.id === payload.chat.bossCatId ? (
                  <span className="catInspectBadge">{t(messageKeys.sharedCatInspectBossLabel)}</span>
                ) : null}
              </div>
            </div>
          </div>
          <ProviderModelFields
            provider={directLaneExecutionTarget.provider}
            instance={directLaneExecutionTarget.instance ?? ''}
            model={directLaneExecutionTarget.model ?? ''}
            modelSelection={directLaneExecutionTarget.modelSelection}
            onTargetChange={(target) => {
              onDirectLaneExecutionTargetChange?.(
                directLaneCat.id,
                createExecutionTargetValueFromProviderSelection(target),
              );
            }}
          />
        </>
      );
    }
    if (isSoloComposer && selectedExecutionTarget && onExecutionTargetChange) {
      return (
        <>
          <ProviderModelFields
            provider={selectedExecutionTarget.provider}
            instance={selectedExecutionTarget.instance ?? ''}
            model={selectedExecutionTarget.model ?? ''}
            modelSelection={selectedExecutionTarget.modelSelection}
            onTargetChange={(target) => {
              onExecutionTargetChange(createExecutionTargetValueFromProviderSelection(target));
            }}
          />
          {onStartFresh ? (
            <div className="sidePanelSectionStack">
              <button
                type="button"
                className="operatorActionButton"
                onClick={() => void onStartFresh()}
                disabled={startFreshBusy}
              >
                {startFreshBusy ? t(messageKeys.chatSidePanelStartingFreshBusy) : t(messageKeys.chatSidePanelStartFresh)}
              </button>
              <p className="operatorEmptyState">
                {t(messageKeys.chatSidePanelStartFreshHint)}
              </p>
            </div>
          ) : null}
        </>
      );
    }
    if (!isSoloComposer && defaultRecipientParticipant) {
      const executionSummary = buildExecutionTargetSummary({
        provider: defaultRecipientParticipant.execution.target.provider,
        instance: defaultRecipientParticipant.execution.target.instance ?? null,
        model: defaultRecipientParticipant.execution.target.model ?? null,
        modelSelection: defaultRecipientParticipant.execution.modelSelection ?? null,
      });
      if (defaultRecipientParticipant.sourceKind !== 'cat') {
        return (
          <div className="catInspectPanelBody">
            <div className="catInspectIdentity">
              <div
                className="catAvatar catInspectAvatar channelParticipantAvatar"
                style={buildParticipantAvatarStyle(defaultRecipientParticipant)}
              >
                {defaultRecipientParticipant.avatarUrl ? null : catInitials(defaultRecipientParticipant.name)}
              </div>
              <div>
                <strong>{defaultRecipientParticipant.name}</strong>
                <span className="catInspectBadge">
                  {t(messageKeys.chatSidePanelTemporaryParticipantLabel)}
                </span>
              </div>
            </div>
            {defaultRecipientParticipant.roleHint ? (
              <div className="catInspectField">
                <span className="catInspectFieldLabel">{t(messageKeys.chatSidePanelRoleLabel)}</span>
                <span>{defaultRecipientParticipant.roleHint}</span>
              </div>
            ) : null}
            <div className="catInspectField">
              <span className="catInspectFieldLabel">
                {t(messageKeys.chatSidePanelAiServiceLabel)}
              </span>
              <span>{executionSummary.providerLabel}</span>
            </div>
            {executionSummary.instanceLabel ? (
              <div className="catInspectField">
                <span className="catInspectFieldLabel">
                  {t(messageKeys.chatSidePanelConnectionLabel)}
                </span>
                <span>{executionSummary.instanceLabel}</span>
              </div>
            ) : null}
            <div className="catInspectField">
              <span className="catInspectFieldLabel">{t(messageKeys.sharedCatInspectModelLabel)}</span>
              <span>{executionSummary.modelLabel}</span>
            </div>
          </div>
        );
      }

      const defaultRecipientCatRef = resolveParticipantCatId(defaultRecipientParticipant);
      const catRecord = defaultRecipientCatRef
        ? payload.chat.cats.find((cat) => cat.id === defaultRecipientCatRef) ?? null
        : null;
      return (
        <div className="catInspectPanelBody">
            <div className="catInspectIdentity">
              <div
                className={defaultRecipientCatRef === payload.chat.bossCatId ? 'catAvatar catAvatarBoss catInspectAvatar' : 'catAvatar catInspectAvatar'}
                style={catRecord?.avatarUrl
                  ? { backgroundImage: `url(${catRecord.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : defaultRecipientParticipant.avatarColor ? { background: defaultRecipientParticipant.avatarColor } : undefined}
            >
              {catRecord?.avatarUrl ? null : catInitials(defaultRecipientParticipant.name)}
            </div>
            <div>
              <strong>{defaultRecipientParticipant.name}</strong>
              {defaultRecipientCatRef === payload.chat.bossCatId ? (
                <span className="catInspectBadge">{t(messageKeys.sharedCatInspectBossLabel)}</span>
              ) : null}
            </div>
          </div>
          <div className="catInspectField">
            <span className="catInspectFieldLabel">{t(messageKeys.chatSidePanelAiServiceLabel)}</span>
            <span>{executionSummary.providerLabel}</span>
          </div>
          {executionSummary.instanceLabel ? (
            <div className="catInspectField">
              <span className="catInspectFieldLabel">{t(messageKeys.chatSidePanelConnectionLabel)}</span>
              <span>{executionSummary.instanceLabel}</span>
            </div>
          ) : null}
          <div className="catInspectField">
            <span className="catInspectFieldLabel">{t(messageKeys.sharedCatInspectModelLabel)}</span>
            <span>{executionSummary.modelLabel}</span>
          </div>
        </div>
      );
    }
    return <p className="operatorEmptyState">{t(messageKeys.chatNewChatDraftExecutionEmptyState)}</p>;
  })();
  sections.push({
    id: 'execution',
    title: t(messageKeys.chatNewChatDraftExecutionTitle),
    children: executionChildren,
  });

  const cwd = selectedChannel.repoPath ?? selectedChannel.chatCwd;
  sections.push({
    id: 'cwd',
    title: t(messageKeys.chatNewChatDraftFolderTitle),
    children: cwd ? (
      <div style={{ display: 'grid', gap: 8 }}>
        <p style={{ margin: 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>{cwd}</p>
        <button
          type="button"
          className="operatorActionButton"
          onClick={() => void openFolderInExplorer(cwd)}
        >
          {t(messageKeys.chatNewChatDraftFolderActionLabel)}
        </button>
      </div>
    ) : (
      <p className="operatorEmptyState">{t(messageKeys.chatNewChatDraftFolderEmptyState)}</p>
    ),
  });

  sections.push({
    id: 'operator',
    title: t(messageKeys.chatSidePanelRunStatusTitle),
    badge: operatorView?.approvals.length ?? 0,
    children: (
      <>
        {operatorError ? (
          <section className="operatorPanel operatorPanelError">
            <div className="operatorPanelHeader">
              <div>
                <p className="operatorEyebrow">{t(messageKeys.chatSidePanelRunStatusTitle)}</p>
                <h2>{t(messageKeys.chatSidePanelRunStatusUnavailableTitle)}</h2>
              </div>
            </div>
            <p className="operatorEmptyState">{operatorError}</p>
          </section>
        ) : null}
        {operatorLoading && !operatorView ? (
          <section className="operatorPanel">
            <div className="operatorPanelHeader">
              <div>
                <p className="operatorEyebrow">{t(messageKeys.chatSidePanelRunStatusTitle)}</p>
                <h2>{t(messageKeys.chatSidePanelLoadingTitle)}</h2>
              </div>
            </div>
            <p className="operatorEmptyState">
              {t(messageKeys.chatSidePanelOperatorLoadingState)}
            </p>
          </section>
        ) : null}
        <ApprovalQueuePanel
          approvals={operatorView?.approvals ?? []}
          actorNameById={operatorView?.actorNameById ?? {}}
          busy={busy}
          onDecision={onApprovalDecision}
        />
        <ProgressSummaryPanel
          inspector={inspectedRun}
          effectivePolicy={operatorView?.effectivePolicy ?? null}
          incidentActions={inspectedRun?.incidentActions ?? operatorView?.incidentActions ?? []}
          pendingApprovalCount={operatorView?.approvals.length ?? 0}
          guardReason={inspectedRun?.guardReason ?? operatorView?.guardReason ?? null}
          cooldownLabel={inspectedRun?.cooldownLabel ?? operatorView?.cooldownLabel ?? null}
          onInspectRun={onInspectRun}
          onOperatorAction={onOperatorAction}
        />
        <ActivityFeed items={operatorView?.activityFeed ?? []} />
        <RunInspector
          runs={operatorView?.runs ?? []}
          actorNameById={operatorView?.actorNameById ?? {}}
          inspector={inspectedRun}
          onSelectRun={onInspectRun}
        />
      </>
    ),
  });

  return sections;
}
