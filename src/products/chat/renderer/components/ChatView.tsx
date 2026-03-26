import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import type { AppShellPayload } from '../../api/contracts';
import type { ChatCat } from '../../api/contracts';
import { SidePanel, type SidePanelSection } from '../../../../design/components/SidePanel';
import {
  catInitials,
  messageTone,
  presentChannelTitle,
  truncatePath,
  type SelectedChannelView,
} from '../chatUtils';
import { openFolderInExplorer } from '../api';
import type { ChatOperatorSnapshot } from '../../shared/operator-loop/index';
import {
  buildChatOperatorView,
  buildRunInspectorView,
} from '../../shared/operator-loop/index';
import { ActivityFeed } from './ActivityFeed';
import { CatAvatarRow } from './CatAvatarRow';
import { ComposerCatStack } from './ComposerCatStack';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorValue,
} from './ModelSelector';
import { ApprovalQueuePanel } from './ApprovalQueuePanel';
import {
  MessageChoices,
  type MessageChoicesSubmitInput,
} from './MessageChoices';
import { ProgressSummaryPanel } from './ProgressSummaryPanel';
import { ProviderModelFields } from './ProviderModelFields';
import { RunInspector } from './RunInspector';
import type { ProviderTargetSelection } from '../../../../shared/providerSelection';
import {
  getProviderDisplayName,
  getProviderModels,
} from '../../../../shared/providerCatalog';

export interface ChatViewProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  operatorSnapshot: ChatOperatorSnapshot | null;
  operatorLoading: boolean;
  operatorError: string;
  composerDraft: string;
  busy: string;
  feedback: string;
  greeting: string;
  channelFiles: File[];
  channelPlusMenuOpen: boolean;
  channelPlusMenuRef: RefObject<HTMLDivElement>;
  channelFileInputRef: RefObject<HTMLInputElement>;
  activeAssignedCats: SelectedChannelView['assignedCats'];
  bossCatName: string;
  bossCatAvatarColor: string | null;
  showBossCatAvatar: boolean;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleChannelPlusMenu: () => void;
  onChannelFileSelect: () => void;
  onChannelFilesChange: (files: File[]) => void;
  onApprovalDecision: (taskId: string, action: 'approve' | 'reroute' | 'reject') => void;
  onChoiceSubmit: (input: MessageChoicesSubmitInput) => void;
  onOperatorAction: (input: {
    action: 'retry' | 'acknowledge';
    taskId?: string | null;
    runId?: string | null;
    checkpointId?: string | null;
    outcomeId?: string | null;
  }) => void;
  autoResize: (el: HTMLTextAreaElement) => void;
  selectedModel?: ModelSelectorValue;
  onModelChange?: (value: ModelSelectorValue) => void;
  onDirectLaneModelChange?: (catId: string, value: ModelSelectorValue) => void;
  onOpenAddCat?: () => void;
  showAddCatButton?: boolean;
}

export function ChatView({
  payload,
  selectedChannel,
  operatorSnapshot,
  operatorLoading,
  operatorError,
  composerDraft,
  busy,
  feedback,
  greeting,
  channelFiles,
  channelPlusMenuOpen,
  channelPlusMenuRef,
  channelFileInputRef,
  activeAssignedCats,
  bossCatName,
  bossCatAvatarColor,
  showBossCatAvatar,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  onToggleChannelPlusMenu,
  onChannelFileSelect,
  onChannelFilesChange,
  onApprovalDecision,
  onChoiceSubmit,
  onOperatorAction,
  autoResize,
  selectedModel,
  onModelChange,
  onDirectLaneModelChange,
  onOpenAddCat,
  showAddCatButton = true,
}: ChatViewProps) {
  const hasConversationStarted =
    selectedChannel.messages.some((message) => message.senderKind !== 'system');

  const roomMode = selectedChannel.roomRouting.mode;
  const leadParticipantId = selectedChannel.roomRouting.leadParticipantId;
  const leadCat = leadParticipantId
    ? activeAssignedCats.find((c) => c.catId === leadParticipantId)
    : null;
  const isSoloComposer = selectedChannel.composerMode === 'solo'
    && roomMode !== 'direct_cat_chat';
  const isDirectLane = roomMode === 'direct_cat_chat';
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('operator');
  function openSidePanelTo(section: string): void {
    setSidePanelOpen(true);
    setSidePanelSection(section);
  }

  const directLaneCat = isDirectLane && leadCat
    ? payload.chat.cats.find((c) => c.id === leadCat.catId) ?? null
    : null;
  const assignedCatRecords = useMemo(
    () =>
      activeAssignedCats
        .map((assignedCat) => payload.chat.cats.find((cat) => cat.id === assignedCat.catId) ?? null)
        .filter((cat): cat is ChatCat => cat != null),
    [activeAssignedCats, payload.chat.cats],
  );
  const showRosterAvatars = isDirectLane
    ? Boolean(leadCat)
    : Boolean((showBossCatAvatar && !isSoloComposer) || activeAssignedCats.length > 0);
  const directLaneModelValue: ModelSelectorValue | null = directLaneCat
    ? {
        provider: directLaneCat.defaultExecutionTarget.provider,
        model: directLaneCat.defaultExecutionTarget.model,
        instance: directLaneCat.defaultExecutionTarget.instance,
        modelSelection: directLaneCat.defaultModelSelection ?? null,
      }
    : null;
  const operatorView = useMemo(
    () => buildChatOperatorView(operatorSnapshot, selectedChannel.id),
    [operatorSnapshot, selectedChannel.id],
  );
  const choiceResponsesBySource = useMemo(() => {
    const responses = new Map<
      string,
      NonNullable<(typeof selectedChannel.messages)[number]['choiceResponse']>
    >();
    for (const message of selectedChannel.messages) {
      if (message.choiceResponse?.sourceMessageId) {
        responses.set(message.choiceResponse.sourceMessageId, message.choiceResponse);
      }
    }
    return responses;
  }, [selectedChannel.messages]);
  const runIdsKey = useMemo(
    () => operatorView?.runs.map((run) => run.id).join('|') ?? '',
    [operatorView],
  );
  const [inspectedRunId, setInspectedRunId] = useState<string | null>(null);

  useEffect(() => {
    setInspectedRunId((current) => {
      if (current && operatorView?.runs.some((run) => run.id === current)) {
        return current;
      }

      return operatorView?.latestRun?.id ?? null;
    });
  }, [operatorView?.latestRun?.id, runIdsKey]);

  const inspectedRun = useMemo(
    () => buildRunInspectorView(operatorView, inspectedRunId),
    [operatorView, inspectedRunId],
  );

  return (
    <>
      <div className="viewShell viewShellChannel">
        <header className="channelTopBar">
          <div className="channelTopBarStart">
            {showRosterAvatars ? (
              <div className="rosterAvatars">
                {roomMode === 'direct_cat_chat' && leadCat ? (
                  <div className="catAvatar" data-tooltip={leadCat.name} style={leadCat.avatarColor ? { background: leadCat.avatarColor } : undefined}>
                    {catInitials(leadCat.name)}
                  </div>
                ) : (
                  <>
                    {showBossCatAvatar && !isSoloComposer ? (
                      <div className="catAvatar catAvatarBoss" data-tooltip={bossCatName} style={bossCatAvatarColor ? { background: bossCatAvatarColor } : undefined}>
                        {catInitials(bossCatName)}
                      </div>
                    ) : null}
                    {activeAssignedCats.map((cat) => (
                      <div key={cat.catId} className="catAvatar" data-tooltip={cat.name} style={cat.avatarColor ? { background: cat.avatarColor } : undefined}>
                        {catInitials(cat.name)}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : null}
          </div>
          <div className="channelTopBarCenter">
            <span className="channelTopBarTitle">
              {presentChannelTitle(selectedChannel.title)}
            </span>
          </div>
          <div className="channelTopBarEnd">
            <button
              className="sidePanelToggle"
              type="button"
              onClick={() => setSidePanelOpen(!sidePanelOpen)}
              aria-label="Toggle inspector panel"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2v12" />
                <rect x="2" y="2" width="12" height="12" rx="2" />
              </svg>
              {(operatorView?.approvals.length ?? 0) > 0 ? (
                <span className="sidePanelBadge">{operatorView?.approvals.length}</span>
              ) : null}
            </button>
          </div>
        </header>
        <div className="channelWorkspace">
          <section className={hasConversationStarted ? 'channelShell' : 'channelShell channelShellFresh'}>
            {feedback ? <p className="feedbackText channelFeedback">{feedback}</p> : null}

            {hasConversationStarted ? (
              <section className="transcriptPanel">
                <div className="transcriptList">
                  {selectedChannel.messages.filter((msg) => payload.chat.showVerboseMessages || msg.metadata?.verbosity !== 'verbose').map((message) => (
                    <article key={message.id} className={messageTone(message.senderKind)}>
                      {message.senderKind !== 'user' && message.senderKind !== 'system' ? (() => {
                        const senderCat = payload.chat.cats.find((c) => c.name === message.senderName);
                        return senderCat ? (
                          <div className="transcriptMessageTop">
                            <div
                              className={senderCat.id === payload.chat.bossCatId ? 'catAvatar catAvatarBoss transcriptAvatar' : 'catAvatar transcriptAvatar'}
                              style={senderCat.avatarUrl
                                ? { backgroundImage: `url(${senderCat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                                : senderCat.avatarColor ? { background: senderCat.avatarColor } : undefined}
                            >
                              {senderCat.avatarUrl ? null : catInitials(senderCat.name)}
                            </div>
                            <strong>{message.senderName}</strong>
                          </div>
                        ) : message.senderName !== 'Orchestrator' ? (
                          <div className="transcriptMessageTop">
                            <strong>{message.senderName}</strong>
                          </div>
                        ) : null;
                      })() : null}
                      {message.body ? <p>{message.body}</p> : null}
                      {message.choices && message.choices.length > 0 ? (
                        <MessageChoices
                          channelId={selectedChannel.id}
                          messageId={message.id}
                          choices={message.choices}
                          existingResponse={choiceResponsesBySource.get(message.id) ?? null}
                          busy={busy.startsWith(`choice:${message.id}:`)}
                          onSubmit={onChoiceSubmit}
                        />
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <section className="freshChatIntro">
                <div className="draftGreeting"><h1>{greeting}</h1></div>
              </section>
            )}

            <form
              className={
                hasConversationStarted
                  ? 'composerCard composerCardDocked'
                  : 'composerCard composerCardFresh'
              }
              onSubmit={(event) => void onSendMessage(event)}
            >
              {channelFiles.length > 0 ? (
                <div className="composerAttachments">
                  {channelFiles.map((file, index) => {
                    const isImage = file.type.startsWith('image/');
                    return (
                      <div key={`${file.name}-${file.size}-${index}`} className="attachmentCard">
                        <button
                          className="attachmentRemove"
                          type="button"
                          onClick={() => onChannelFilesChange(channelFiles.filter((_, i) => i !== index))}
                          aria-label={`Remove ${file.name}`}
                        >
                          &times;
                        </button>
                        {isImage ? (
                          <img
                            className="attachmentPreview"
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                          />
                        ) : (
                          <div className="attachmentFileIcon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                            </svg>
                          </div>
                        )}
                        <span className="attachmentName">{file.name}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <textarea
                className="composerInput"
                rows={1}
                placeholder="How can I help you today?"
                value={composerDraft}
                onChange={(event) => { onComposerChange(event.target.value); autoResize(event.target); }}
                onKeyDown={(event) => void onComposerKeyDown(event)}
              />
              <div className="composerBottomRow">
                <div className="composerLeftGroup">
                  <div className="composerPlusWrapper" ref={channelPlusMenuRef}>
                    <button
                      className="composerPlusButton"
                      type="button"
                      aria-label="Attach"
                      onClick={onToggleChannelPlusMenu}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3v10" />
                        <path d="M3 8h10" />
                      </svg>
                    </button>
                    {channelPlusMenuOpen ? (
                      <div className="composerPlusMenu">
                        <button
                          className="composerPlusMenuItem"
                          type="button"
                          onClick={onChannelFileSelect}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
                            <path d="M8 2v8" />
                            <path d="M4 6l4-4 4 4" />
                          </svg>
                          Add photos and files
                        </button>
                      </div>
                    ) : null}
                  </div>
                {(() => {
                  const cwd = selectedChannel.repoPath ?? selectedChannel.chatCwd;
                  if (!cwd) return null;
                  return (
                    <span
                      className="composerCwdChip composerCwdClickable"
                      data-tooltip={cwd}
                      role="button"
                      tabIndex={0}
                      onClick={() => openSidePanelTo('cwd')}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                      </svg>
                      <span>{truncatePath(cwd)}</span>
                    </span>
                  );
                })()}
              </div>
                {isDirectLane && directLaneCat && directLaneModelValue ? (
                  <ComposerCatStack
                    cats={[directLaneCat]}
                    bossCatId={payload.chat.bossCatId}
                    leadCatId={directLaneCat.id}
                    onClick={() => openSidePanelTo('execution')}
                  />
                ) : isSoloComposer && selectedModel && onModelChange ? (
                  <div style={{ marginRight: 8 }}>
                    <ModelSelectorChip
                      label={buildModelSelectorLabel(selectedModel)}
                      onClick={() => openSidePanelTo('execution')}
                    />
                  </div>
                ) : !isSoloComposer && leadCat ? (() => {
                  const catRecord = payload.chat.cats.find((c) => c.id === leadCat.catId);
                  return (
                    <div
                      className={leadCat.catId === payload.chat.bossCatId ? 'catAvatar composerStackAvatar catAvatarBoss composerLeadAvatar' : 'catAvatar composerStackAvatar composerLeadAvatar'}
                      data-tooltip={leadCat.name}
                      style={catRecord?.avatarUrl
                        ? { backgroundImage: `url(${catRecord.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : leadCat.avatarColor ? { background: leadCat.avatarColor } : undefined}
                      onClick={() => openSidePanelTo('execution')}
                      role="button"
                      tabIndex={0}
                    >
                      {catRecord?.avatarUrl ? null : catInitials(leadCat.name)}
                    </div>
                  );
                })() : null}
                <button
                  className="composerSendButton"
                  disabled={!composerDraft.trim() || busy === 'message:send'}
                  type="submit"
                  aria-label="Send"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 13V3" />
                    <path d="M3 7l5-5 5 5" />
                  </svg>
                </button>
              </div>
              <input
                ref={channelFileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(event) => {
                  const input = event.currentTarget;
                  if (input.files && input.files.length > 0) {
                    const selected = Array.from(input.files);
                    onChannelFilesChange([...channelFiles, ...selected]);
                  }
                  input.value = '';
                }}
              />
            </form>
          </section>

        </div>
      </div>
      {sidePanelOpen ? (
        <SidePanel
          title="Workspace"
          activeSection={sidePanelSection}
          onSectionToggle={setSidePanelSection}
          onClose={() => setSidePanelOpen(false)}
          className="chatPaneSidePanel"
          sections={buildSidePanelSections()}
        />
      ) : null}
    </>
  );

  function buildSidePanelSections(): SidePanelSection[] {
    const sections: SidePanelSection[] = [];

    // --- Operator section ---
    sections.push({
      id: 'operator',
      title: 'Operator',
      badge: operatorView?.approvals.length ?? 0,
      children: (
        <>
          {operatorError ? (
            <section className="operatorPanel operatorPanelError">
              <div className="operatorPanelHeader">
                <div>
                  <p className="operatorEyebrow">Operator loop</p>
                  <h2>Inspector unavailable</h2>
                </div>
              </div>
              <p className="operatorEmptyState">{operatorError}</p>
            </section>
          ) : null}
          {operatorLoading && !operatorView ? (
            <section className="operatorPanel">
              <div className="operatorPanelHeader">
                <div>
                  <p className="operatorEyebrow">Operator loop</p>
                  <h2>Loading</h2>
                </div>
              </div>
              <p className="operatorEmptyState">Loading approval, trace, and run state.</p>
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
            onInspectRun={setInspectedRunId}
            onOperatorAction={onOperatorAction}
          />
          <ActivityFeed items={operatorView?.activityFeed ?? []} />
          <RunInspector
            runs={operatorView?.runs ?? []}
            actorNameById={operatorView?.actorNameById ?? {}}
            inspector={inspectedRun}
            onSelectRun={setInspectedRunId}
          />
        </>
      ),
    });

    // --- Execution Target section ---
    const executionChildren = (() => {
      if (isDirectLane && directLaneCat && directLaneModelValue) {
        return (
          <>
            <CatAvatarRow
              cats={[directLaneCat]}
              bossCatId={payload.chat.bossCatId}
              selectedIds={[directLaneCat.id]}
              highlightedId={directLaneCat.id}
              leadCatId={directLaneCat.id}
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
      if (!isSoloComposer && leadCat) {
        const catRecord = payload.chat.cats.find((c) => c.id === leadCat.catId);
        const providerName = getProviderDisplayName(leadCat.execution.target.provider);
        const modelLabel = leadCat.execution.target.model
          ? (getProviderModels(leadCat.execution.target.provider)
              .find((m) => m.value === leadCat.execution.target.model)?.label ?? leadCat.execution.target.model)
              .replace(/\s*\(default\)\s*/iu, '')
          : null;
        return (
          <div className="catInspectPanelBody">
            <div className="catInspectIdentity">
              <div
                className={leadCat.catId === payload.chat.bossCatId ? 'catAvatar catAvatarBoss catInspectAvatar' : 'catAvatar catInspectAvatar'}
                style={catRecord?.avatarUrl
                  ? { backgroundImage: `url(${catRecord.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : leadCat.avatarColor ? { background: leadCat.avatarColor } : undefined}
              >
                {catRecord?.avatarUrl ? null : catInitials(leadCat.name)}
              </div>
              <div>
                <strong>{leadCat.name}</strong>
                {leadCat.catId === payload.chat.bossCatId ? <span className="catInspectBadge">Boss</span> : null}
              </div>
            </div>
            <div className="catInspectField">
              <span className="catInspectFieldLabel">Provider</span>
              <span>{providerName}</span>
            </div>
            {leadCat.execution.target.instance ? (
              <div className="catInspectField">
                <span className="catInspectFieldLabel">Instance</span>
                <span>{leadCat.execution.target.instance}</span>
              </div>
            ) : null}
            <div className="catInspectField">
              <span className="catInspectFieldLabel">Model</span>
              <span>{modelLabel ?? 'default'}</span>
            </div>
          </div>
        );
      }
      return <p className="operatorEmptyState">No execution target configured.</p>;
    })();
    sections.push({ id: 'execution', title: 'Execution Target', children: executionChildren });

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
                highlightedId={leadCat?.catId ?? null}
                leadCatId={leadCat?.catId ?? null}
                toggleable={false}
                showLeadBadge
                onToggle={() => {}}
                onHighlight={() => {}}
              />
            ) : (
              <p className="operatorEmptyState">No cats in this room yet.</p>
            )}
            {showAddCatButton ? (
              <button
                type="button"
                className="operatorActionButton"
                onClick={() => {
                  setSidePanelOpen(false);
                  onOpenAddCat?.();
                }}
              >
                Add or manage cats
              </button>
            ) : null}
          </div>
        ),
      });
    }

    // --- Working Directory section ---
    const cwd = selectedChannel.repoPath ?? selectedChannel.chatCwd;
    sections.push({
      id: 'cwd',
      title: 'Working Directory',
      children: cwd ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>{cwd}</p>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => void openFolderInExplorer(cwd)}
          >
            Open in Explorer
          </button>
        </div>
      ) : (
        <p className="operatorEmptyState">No working directory set.</p>
      ),
    });

    return sections;
  }
}
