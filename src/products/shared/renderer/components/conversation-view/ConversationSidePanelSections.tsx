import type { SidePanelSection } from '../../../../../design/components/SidePanel.js';
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
import type { WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

export interface BuildConversationSidePanelSectionsOptions {
  selectedChannel: SelectedChannelView;
  busy: WorkspaceBusyState;
  operatorView: ChatOperatorView | null;
  operatorLoading: boolean;
  operatorError: string;
  inspectedRun: ChatRunInspectorView | null;
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
  selectedChannel,
  busy,
  operatorView,
  operatorLoading,
  operatorError,
  inspectedRun,
  onInspectRun,
  onApprovalDecision,
  onOperatorAction,
}: BuildConversationSidePanelSectionsOptions): SidePanelSection[] {
  const { t } = useI18n();
  const sections: SidePanelSection[] = [];

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
