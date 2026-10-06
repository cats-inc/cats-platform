import type { SidePanelSection } from '../../../../../design/components/SidePanel.js';
import type { AppShellPayload, ChatCat } from '../../../api/workspaceContracts.js';
import type { ResolvedChannelParticipant } from '../../../channelParticipants.js';
import type {
  ChatOperatorView,
  ChatRunInspectorView,
} from '../../../operator-loop/index.js';
import { openFolderInExplorer } from '../../api/index.js';
import type { SelectedChannelView } from '../../workspaceChatUtils.js';
import { ActivityFeed } from '../ActivityFeed.js';
import { ApprovalQueuePanel } from '../ApprovalQueuePanel.js';
import { ProgressSummaryPanel } from '../ProgressSummaryPanel.js';
import { RunInspector } from '../RunInspector.js';
import { ConversationParticipantsSection } from './ConversationParticipantsSection.js';
import type { WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

export interface BuildConversationSidePanelSectionsOptions {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  busy: WorkspaceBusyState;
  operatorView: ChatOperatorView | null;
  operatorLoading: boolean;
  operatorError: string;
  assignedCatRecords: ChatCat[];
  assignedAdhocParticipants: ResolvedChannelParticipant[];
  defaultRecipientCatId: string | null;
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
}

export function buildConversationSidePanelSections({
  payload,
  selectedChannel,
  busy,
  operatorView,
  operatorLoading,
  operatorError,
  assignedCatRecords,
  assignedAdhocParticipants,
  defaultRecipientCatId,
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
}: BuildConversationSidePanelSectionsOptions): SidePanelSection[] {
  const { t } = useI18n();
  const sections: SidePanelSection[] = [];

  if (showAddCatButton || assignedCatRecords.length > 0 || assignedAdhocParticipants.length > 0) {
    sections.push({
      id: 'cats',
      title: assignedAdhocParticipants.length > 0
        ? t(messageKeys.chatNewChatDraftSidePanelParticipantsGroupTitle)
        : t(messageKeys.chatNewChatDraftSidePanelParticipantsCatsTitle),
      children: (
        <ConversationParticipantsSection
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

  const cwd = selectedChannel.repoPath ?? selectedChannel.chatCwd;
  sections.push({
    id: 'cwd',
    title: t(messageKeys.chatNewChatDraftSidePanelFolderTitle),
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
      <p className="operatorEmptyState">{t(messageKeys.chatNewChatDraftSidePanelFolderEmptyState)}</p>
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
