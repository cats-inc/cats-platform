import { SidePanel, type SidePanelSection } from '../../../../../design/components/SidePanel.js';
import type { ProviderTargetSelection } from '../../../../../shared/providerSelection.js';
import {
  getProviderDisplayName,
  getProviderModels,
} from '../../../../../shared/providerCatalog.js';
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
import type { ModelSelectorValue } from '../ModelSelector.js';
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
  directLaneModelValue: ModelSelectorValue | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
  selectedModel?: ModelSelectorValue;
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
  onModelChange?: (value: ModelSelectorValue) => void;
  onDirectLaneModelChange?: (catId: string, value: ModelSelectorValue) => void;
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
  directLaneModelValue,
  isDirectLane,
  isSoloComposer,
  selectedModel,
  inspectedRun,
  showAddCatButton,
  onSectionToggle,
  onClose,
  onInspectRun,
  onApprovalDecision,
  onOperatorAction,
  onModelChange,
  onDirectLaneModelChange,
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
      if (isDirectLane && directLaneCat && directLaneModelValue) {
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
              provider={directLaneModelValue.provider}
              instance={directLaneModelValue.instance ?? ''}
              model={directLaneModelValue.model ?? ''}
              modelSelection={directLaneModelValue.modelSelection}
              onTargetChange={(target: ProviderTargetSelection) => {
                onDirectLaneModelChange?.(directLaneCat.id, {
                  provider: target.provider,
                  model: target.model || null,
                  instance: target.instance || null,
                  modelSelection: target.modelSelection ?? null,
                });
              }}
            />
          </>
        );
      }
      if (isSoloComposer && selectedModel && onModelChange) {
        return (
          <ProviderModelFields
            provider={selectedModel.provider}
            instance={selectedModel.instance ?? ''}
            model={selectedModel.model ?? ''}
            modelSelection={selectedModel.modelSelection}
            onTargetChange={(target: ProviderTargetSelection) => {
              onModelChange({
                provider: target.provider,
                model: target.model || null,
                instance: target.instance || null,
                modelSelection: target.modelSelection ?? null,
              });
            }}
          />
        );
      }
      if (!isSoloComposer && defaultRecipientCat) {
        const catRecord = payload.chat.cats.find((cat) => cat.id === defaultRecipientCat.catId);
        const providerName = getProviderDisplayName(defaultRecipientCat.execution.target.provider);
        const modelLabel = defaultRecipientCat.execution.target.model
          ? (getProviderModels(defaultRecipientCat.execution.target.provider)
              .find((model) => model.value === defaultRecipientCat.execution.target.model)?.label ?? defaultRecipientCat.execution.target.model)
              .replace(/\s*\(default\)\s*/iu, '')
          : null;
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
              <span>{providerName}</span>
            </div>
            {defaultRecipientCat.execution.target.instance ? (
              <div className="catInspectField">
                <span className="catInspectFieldLabel">Connection</span>
                <span>{defaultRecipientCat.execution.target.instance}</span>
              </div>
            ) : null}
            <div className="catInspectField">
              <span className="catInspectFieldLabel">Model</span>
              <span>{modelLabel ?? 'default'}</span>
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
