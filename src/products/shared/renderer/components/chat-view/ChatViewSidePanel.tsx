import { SidePanel, type SidePanelSection } from '../../../../../design/components/SidePanel.js';
import type {
  AppShellPayload,
  ChatCat,
} from '../../../api/workspaceContracts.js';
import type {
  ChatOperatorView,
  ChatRunInspectorView,
} from '../../../operator-loop/index.js';
import { openFolderInExplorer } from '../../api/index.js';
import { catInitials, type SelectedChannelView } from '../../workspaceChatUtils.js';
import { ActivityFeed } from '../ActivityFeed.js';
import { ApprovalQueuePanel } from '../ApprovalQueuePanel.js';
import { CatAvatarRow } from '../CatAvatarRow.js';
import {
  buildExecutionTargetSummary,
  createExecutionTargetValueFromProviderSelection,
  type ExecutionTargetValue,
} from '../ExecutionTarget.js';
import { ProgressSummaryPanel } from '../ProgressSummaryPanel.js';
import { ProviderModelFields } from '../ProviderModelFields.js';
import { RunInspector } from '../RunInspector.js';
import type { WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';

export interface ChatViewSidePanelProps {
  sidePanelOpen: boolean;
  sidePanelSection: string | null;
  sidePanelPosition: 'side' | 'bottom';
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  busy: WorkspaceBusyState;
  operatorView: ChatOperatorView | null;
  operatorLoading: boolean;
  operatorError: string;
  assignedCatRecords: ChatCat[];
  defaultRecipientCat: SelectedChannelView['assignedCats'][number] | null;
  directLaneCat: ChatCat | null;
  directLaneExecutionTarget: ExecutionTargetValue | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
  selectedExecutionTarget?: ExecutionTargetValue;
  inspectedRun: ChatRunInspectorView | null;
  showAddCatButton: boolean;
  onSectionToggle: (section: string | null) => void;
  onClose: () => void;
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
  onDirectLaneExecutionTargetChange?: (catId: string, value: ExecutionTargetValue) => void;
  onOpenAddCat?: () => void;
}

export function ChatViewSidePanel({
  sidePanelOpen,
  sidePanelSection,
  sidePanelPosition,
  payload,
  selectedChannel,
  busy,
  operatorView,
  operatorLoading,
  operatorError,
  assignedCatRecords,
  defaultRecipientCat,
  directLaneCat,
  directLaneExecutionTarget,
  isDirectLane,
  isSoloComposer,
  selectedExecutionTarget,
  inspectedRun,
  showAddCatButton,
  onSectionToggle,
  onClose,
  onInspectRun,
  onApprovalDecision,
  onOperatorAction,
  onExecutionTargetChange,
  onDirectLaneExecutionTargetChange,
  onOpenAddCat,
}: ChatViewSidePanelProps) {
  if (!sidePanelOpen) {
    return null;
  }

  return (
    <SidePanel
      title="Chat Setup"
      activeSection={sidePanelSection}
      onSectionToggle={onSectionToggle}
      onClose={onClose}
      position={sidePanelPosition}
      className="chatPaneSidePanel chatPaneSidePanelBelowBar"
      sections={buildSidePanelSections()}
    />
  );

  function buildSidePanelSections(): SidePanelSection[] {
    const sections: SidePanelSection[] = [];

    if (showAddCatButton || assignedCatRecords.length > 0) {
      sections.push({
        id: 'cats',
        title: 'Cats',
        children: (
          <div className="sidePanelSectionStack">
            {assignedCatRecords.length > 0 ? (
              <CatAvatarRow
                cats={assignedCatRecords}
                bossCatId={payload.chat.bossCatId}
                selectedIds={assignedCatRecords.map((cat) => cat.id)}
                highlightedId={defaultRecipientCat?.catId ?? null}
                defaultRecipientCatId={defaultRecipientCat?.catId ?? null}
                toggleable={false}
                showLeadBadge
                onToggle={() => {}}
                onHighlight={() => {}}
              />
            ) : (
              <p className="operatorEmptyState">No cats are in this chat yet.</p>
            )}
            {showAddCatButton ? (
              <button
                type="button"
                className="operatorActionButton"
                onClick={() => {
                  onClose();
                  onOpenAddCat?.();
                }}
              >
                Choose cats
              </button>
            ) : null}
          </div>
        ),
      });
    }

    const executionChildren = (() => {
      if (isDirectLane && directLaneCat && directLaneExecutionTarget) {
        return (
          <>
            <CatAvatarRow
              cats={[directLaneCat]}
              bossCatId={payload.chat.bossCatId}
              selectedIds={[directLaneCat.id]}
              highlightedId={directLaneCat.id}
              defaultRecipientCatId={directLaneCat.id}
              toggleable={false}
              showLeadBadge
              onToggle={() => {}}
              onHighlight={() => {}}
            />
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
          <ProviderModelFields
            provider={selectedExecutionTarget.provider}
            instance={selectedExecutionTarget.instance ?? ''}
            model={selectedExecutionTarget.model ?? ''}
            modelSelection={selectedExecutionTarget.modelSelection}
            onTargetChange={(target) => {
              onExecutionTargetChange(createExecutionTargetValueFromProviderSelection(target));
            }}
          />
        );
      }
      if (!isSoloComposer && defaultRecipientCat) {
        const catRecord = payload.chat.cats.find((cat) => cat.id === defaultRecipientCat.catId);
        const executionSummary = buildExecutionTargetSummary({
          provider: defaultRecipientCat.execution.target.provider,
          instance: defaultRecipientCat.execution.target.instance ?? null,
          model: defaultRecipientCat.execution.target.model ?? null,
          modelSelection: defaultRecipientCat.execution.modelSelection ?? null,
        });
        return (
          <div className="catInspectPanelBody">
            <div className="catInspectIdentity">
              <div
                className={defaultRecipientCat.catId === payload.chat.bossCatId ? 'catAvatar catAvatarBoss catInspectAvatar' : 'catAvatar catInspectAvatar'}
                style={catRecord?.avatarUrl
                  ? { backgroundImage: `url(${catRecord.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : defaultRecipientCat.avatarColor ? { background: defaultRecipientCat.avatarColor } : undefined}
              >
                {catRecord?.avatarUrl ? null : catInitials(defaultRecipientCat.name)}
              </div>
              <div>
                <strong>{defaultRecipientCat.name}</strong>
                {defaultRecipientCat.catId === payload.chat.bossCatId ? <span className="catInspectBadge">Boss</span> : null}
              </div>
            </div>
            <div className="catInspectField">
              <span className="catInspectFieldLabel">AI Service</span>
              <span>{executionSummary.providerLabel}</span>
            </div>
            {executionSummary.instanceLabel ? (
              <div className="catInspectField">
                <span className="catInspectFieldLabel">Connection</span>
                <span>{executionSummary.instanceLabel}</span>
              </div>
            ) : null}
            <div className="catInspectField">
              <span className="catInspectFieldLabel">Model</span>
              <span>{executionSummary.modelLabel}</span>
            </div>
          </div>
        );
      }
      return <p className="operatorEmptyState">No AI reply setup yet.</p>;
    })();
    sections.push({ id: 'execution', title: 'AI Reply', children: executionChildren });

    const cwd = selectedChannel.repoPath ?? selectedChannel.chatCwd;
    sections.push({
      id: 'cwd',
      title: 'Folder',
      children: cwd ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>{cwd}</p>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => void openFolderInExplorer(cwd)}
          >
            Open folder
          </button>
        </div>
      ) : (
        <p className="operatorEmptyState">No folder selected yet.</p>
      ),
    });

    sections.push({
      id: 'operator',
      title: 'Run Status',
      badge: operatorView?.approvals.length ?? 0,
      children: (
        <>
          {operatorError ? (
            <section className="operatorPanel operatorPanelError">
              <div className="operatorPanelHeader">
                <div>
                  <p className="operatorEyebrow">Run Status</p>
                  <h2>Status unavailable</h2>
                </div>
              </div>
              <p className="operatorEmptyState">{operatorError}</p>
            </section>
          ) : null}
          {operatorLoading && !operatorView ? (
            <section className="operatorPanel">
              <div className="operatorPanelHeader">
                <div>
                  <p className="operatorEyebrow">Run Status</p>
                  <h2>Loading</h2>
                </div>
              </div>
              <p className="operatorEmptyState">Loading approvals, activity, and run details.</p>
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
}
