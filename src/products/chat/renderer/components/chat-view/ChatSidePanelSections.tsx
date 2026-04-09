import type { CSSProperties } from 'react';

import type { SidePanelSection } from '../../../../../design/components/SidePanel.js';
import type { ProviderTargetSelection } from '../../../../../shared/providerSelection.js';
import {
  getProviderDisplayName,
  getProviderModels,
} from '../../../../../shared/providerCatalog.js';
import type { AppShellPayload, ChatCat } from '../../../api/contracts.js';
import type {
  ChatOperatorView,
  ChatRunInspectorView,
} from '../../../shared/operator-loop/index.js';
import {
  resolveParticipantCatId,
  type ResolvedChannelParticipant,
} from '../../../shared/channelParticipants.js';
import { openFolderInExplorer } from '../../api/index.js';
import { catInitials, type SelectedChannelView } from '../../chatUtils.js';
import { ActivityFeed } from '../ActivityFeed.js';
import { ApprovalQueuePanel } from '../ApprovalQueuePanel.js';
import type { ModelSelectorValue } from '../ModelSelector.js';
import { ProgressSummaryPanel } from '../ProgressSummaryPanel.js';
import { ProviderModelFields } from '../ProviderModelFields.js';
import { RunInspector } from '../RunInspector.js';
import { ChatParticipantsSection } from './ChatParticipantsSection.js';

export interface BuildChatSidePanelSectionsOptions {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  busy: string;
  operatorView: ChatOperatorView | null;
  operatorLoading: boolean;
  operatorError: string;
  assignedCatRecords: ChatCat[];
  assignedAdhocParticipants: ResolvedChannelParticipant[];
  defaultRecipientCatId: string | null;
  defaultRecipientParticipant: ResolvedChannelParticipant | null;
  directLaneCat: ChatCat | null;
  directLaneModelValue: ModelSelectorValue | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
  selectedModel?: ModelSelectorValue;
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
  onModelChange?: (value: ModelSelectorValue) => void;
  onDirectLaneModelChange?: (catId: string, value: ModelSelectorValue) => void;
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
  directLaneModelValue,
  isDirectLane,
  isSoloComposer,
  selectedModel,
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
  onModelChange,
  onDirectLaneModelChange,
  buildParticipantAvatarStyle,
}: BuildChatSidePanelSectionsOptions): SidePanelSection[] {
  const sections: SidePanelSection[] = [];

  if (showAddCatButton || assignedCatRecords.length > 0 || assignedAdhocParticipants.length > 0) {
    sections.push({
      id: 'cats',
      title: assignedAdhocParticipants.length > 0 ? 'Participants' : 'Cats',
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
    if (isDirectLane && directLaneCat && directLaneModelValue) {
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
                {directLaneCat.id === payload.chat.bossCatId ? <span className="catInspectBadge">Boss</span> : null}
              </div>
            </div>
          </div>
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
    if (!isSoloComposer && defaultRecipientParticipant) {
      const providerName = getProviderDisplayName(defaultRecipientParticipant.execution.target.provider);
      const modelLabel = defaultRecipientParticipant.execution.target.model
        ? (getProviderModels(defaultRecipientParticipant.execution.target.provider)
            .find((model) => model.value === defaultRecipientParticipant.execution.target.model)?.label
              ?? defaultRecipientParticipant.execution.target.model)
            .replace(/\s*\(default\)\s*/iu, '')
        : null;
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
                <span className="catInspectBadge">Temporary</span>
              </div>
            </div>
            {defaultRecipientParticipant.roleHint ? (
              <div className="catInspectField">
                <span className="catInspectFieldLabel">Role</span>
                <span>{defaultRecipientParticipant.roleHint}</span>
              </div>
            ) : null}
            <div className="catInspectField">
              <span className="catInspectFieldLabel">AI Service</span>
              <span>{providerName}</span>
            </div>
            {defaultRecipientParticipant.execution.target.instance ? (
              <div className="catInspectField">
                <span className="catInspectFieldLabel">Connection</span>
                <span>{defaultRecipientParticipant.execution.target.instance}</span>
              </div>
            ) : null}
            <div className="catInspectField">
              <span className="catInspectFieldLabel">Model</span>
              <span>{modelLabel ?? 'default'}</span>
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
              {defaultRecipientCatRef === payload.chat.bossCatId ? <span className="catInspectBadge">Boss</span> : null}
            </div>
          </div>
          <div className="catInspectField">
            <span className="catInspectFieldLabel">AI Service</span>
            <span>{providerName}</span>
          </div>
          {defaultRecipientParticipant.execution.target.instance ? (
            <div className="catInspectField">
              <span className="catInspectFieldLabel">Connection</span>
              <span>{defaultRecipientParticipant.execution.target.instance}</span>
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
