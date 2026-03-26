import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import type { AppShellPayload } from '../../api/contracts';
import {
  catInitials,
  messageTone,
  truncatePath,
  type SelectedChannelView,
} from '../chatUtils';
import { openFolderInExplorer } from '../api';
import {
  chatLifecycleClassName,
  chatLifecycleLabel,
  resolveChatLifecycleState,
} from '../../shared/lifecycle';
import type { ChatOperatorSnapshot } from '../../shared/operator-loop/index';
import {
  buildChatOperatorView,
  buildRunInspectorView,
} from '../../shared/operator-loop/index';
import { ActivityFeed } from './ActivityFeed';
import { CatInspectPanel } from './CatInspectPanel';
import { ComposerCatStack } from './ComposerCatStack';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  ModelSelectorPanel,
  type ModelSelectorValue,
} from './ModelSelector';
import { ApprovalQueuePanel } from './ApprovalQueuePanel';
import {
  MessageChoices,
  type MessageChoicesSubmitInput,
} from './MessageChoices';
import { ProgressSummaryPanel } from './ProgressSummaryPanel';
import { RunInspector } from './RunInspector';

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
  addCatOpen: boolean;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleAddCat: () => void;
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
  showAddCatButton?: boolean;
  selectedModel?: ModelSelectorValue;
  onModelChange?: (value: ModelSelectorValue) => void;
  onDirectLaneModelChange?: (catId: string, value: ModelSelectorValue) => void;
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
  onToggleAddCat,
  onToggleChannelPlusMenu,
  onChannelFileSelect,
  onChannelFilesChange,
  onApprovalDecision,
  onChoiceSubmit,
  onOperatorAction,
  autoResize,
  showAddCatButton = true,
  selectedModel,
  onModelChange,
  onDirectLaneModelChange,
}: ChatViewProps) {
  const hasConversationStarted =
    selectedChannel.messages.some((message) => message.senderKind !== 'system');

  const roomMode = selectedChannel.roomRouting.mode;
  const leadParticipantId = selectedChannel.roomRouting.leadParticipantId;
  const leadCat = leadParticipantId
    ? activeAssignedCats.find((c) => c.catId === leadParticipantId)
    : null;
  const bossLifecycle = resolveChatLifecycleState(selectedChannel.orchestratorLease.status);
  const isSoloComposer = selectedChannel.composerMode === 'solo'
    && roomMode !== 'direct_cat_chat';
  const isDirectLane = roomMode === 'direct_cat_chat';
  const [directLanePanelOpen, setDirectLanePanelOpen] = useState(false);

  const directLaneCat = isDirectLane && leadCat
    ? payload.chat.cats.find((c) => c.id === leadCat.catId) ?? null
    : null;
  const directLaneModelValue: ModelSelectorValue | null = directLaneCat
    ? {
        provider: directLaneCat.defaultExecutionTarget.provider,
        model: directLaneCat.defaultExecutionTarget.model,
        instance: directLaneCat.defaultExecutionTarget.instance,
        modelSelection: directLaneCat.defaultModelSelection ?? null,
      }
    : null;
  const presenceItems = roomMode === 'direct_cat_chat' && leadCat
    ? [
        {
          id: `cat:${leadCat.catId}`,
          name: leadCat.name,
          state: resolveChatLifecycleState(leadCat.execution.lease.status),
          isEntry: true,
        },
        ...activeAssignedCats
          .filter((cat) => cat.catId !== leadCat.catId)
          .map((cat) => ({
            id: `cat:${cat.catId}`,
            name: cat.name,
            state: resolveChatLifecycleState(cat.execution.lease.status),
            isEntry: false,
          })),
      ]
    : isSoloComposer
      ? [
          {
            id: 'chat',
            name: 'Chat',
            state: bossLifecycle,
            isEntry: true,
          },
          ...activeAssignedCats.map((cat) => ({
            id: `cat:${cat.catId}`,
            name: cat.name,
            state: resolveChatLifecycleState(cat.execution.lease.status),
            isEntry: false,
          })),
        ]
    : [
        {
          id: 'orchestrator',
          name: bossCatName,
          state: bossLifecycle,
          isEntry: true,
        },
        ...activeAssignedCats.map((cat) => ({
          id: `cat:${cat.catId}`,
          name: cat.name,
          state: resolveChatLifecycleState(cat.execution.lease.status),
          isEntry: false,
        })),
      ];
  const entryPresence = presenceItems[0] ?? {
    id: 'orchestrator',
    name: bossCatName,
    state: bossLifecycle,
    isEntry: true,
  };

  const modeLabel = roomMode === 'direct_cat_chat'
    ? 'Direct chat'
    : isSoloComposer
      ? 'Chat'
    : activeAssignedCats.length > 0
      ? 'Group'
      : 'Boss Chat';
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
      <header className="channelTopBar">
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
        <div className="channelTopBarMeta">
          <div className="channelTopBarHeading">
            {roomMode === 'direct_cat_chat' && leadCat ? (
              <span className="channelTopBarTitle">{leadCat.name}</span>
            ) : null}
            <span className="channelModeBadge">{modeLabel}</span>
            {roomMode === 'boss_chat' && activeAssignedCats.length > 0 && leadCat ? (
              <span className="channelLeadLabel">Lead: {leadCat.name}</span>
            ) : null}
            <span className={`channelPresenceBadge ${chatLifecycleClassName(entryPresence.state)}`}>
              {entryPresence.name} {chatLifecycleLabel(entryPresence.state)}
            </span>
          </div>
          <div className="channelPresenceRow">
            {presenceItems
              .filter((item) => !item.isEntry)
              .map((item) => (
                <span
                  key={item.id}
                  className={`channelPresencePill ${chatLifecycleClassName(item.state)}`}
                >
                  {item.name} {chatLifecycleLabel(item.state)}
                </span>
              ))}
          </div>
        </div>
        {showAddCatButton ? (
          <button
            className="addCatButton"
            type="button"
            onClick={onToggleAddCat}
          >
            +
          </button>
        ) : null}
      </header>
      <div className="viewShell viewShellChannel">
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
                      onClick={() => void openFolderInExplorer(cwd)}
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
                  <>
                    <ComposerCatStack
                      cats={[directLaneCat]}
                      bossCatId={payload.chat.bossCatId}
                      leadCatId={directLaneCat.id}
                      onClick={() => setDirectLanePanelOpen(!directLanePanelOpen)}
                    />
                    {directLanePanelOpen ? (
                      <ModelSelectorPanel
                        mode="direct-lane"
                        cats={[directLaneCat]}
                        bossCatId={payload.chat.bossCatId}
                        selectedCatIds={[directLaneCat.id]}
                        highlightedCatId={directLaneCat.id}
                        leadCatId={directLaneCat.id}
                        modelValue={directLaneModelValue}
                        onModelChange={(value) => {
                          onDirectLaneModelChange?.(directLaneCat.id, value);
                        }}
                        onClose={() => setDirectLanePanelOpen(false)}
                      />
                    ) : null}
                  </>
                ) : isSoloComposer && selectedModel && onModelChange ? (
                  <div style={{ marginRight: 8 }}>
                    <ModelSelectorChip
                      label={buildModelSelectorLabel(selectedModel)}
                      onClick={() => setDirectLanePanelOpen(!directLanePanelOpen)}
                    />
                    {directLanePanelOpen ? (
                      <ModelSelectorPanel
                        mode="draft"
                        cats={[]}
                        bossCatId={payload.chat.bossCatId}
                        selectedCatIds={[]}
                        highlightedCatId={null}
                        modelValue={selectedModel}
                        onModelChange={onModelChange}
                        onClose={() => setDirectLanePanelOpen(false)}
                      />
                    ) : null}
                  </div>
                ) : !isSoloComposer && leadCat ? (
                  <ComposerLeadCatAvatar
                    cat={leadCat}
                    isBoss={leadCat.catId === payload.chat.bossCatId}
                    payload={payload}
                  />
                ) : null}
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

          <aside className="operatorRail">
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
          </aside>
        </div>
      </div>
    </>
  );
}

function ComposerLeadCatAvatar({
  cat,
  isBoss,
  payload,
}: {
  cat: { catId: string; name: string; avatarColor: string | null; avatarUrl?: string | null; execution: { target: { provider: string; instance: string | null; model: string | null } }; skillProfile?: string | null };
  isBoss: boolean;
  payload: AppShellPayload;
}) {
  const [inspectOpen, setInspectOpen] = useState(false);

  return (
    <>
      <div
        className={isBoss ? 'catAvatar composerStackAvatar catAvatarBoss composerLeadAvatar' : 'catAvatar composerStackAvatar composerLeadAvatar'}
        data-tooltip={cat.name}
        style={cat.avatarUrl
          ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : cat.avatarColor ? { background: cat.avatarColor } : undefined}
        onClick={() => setInspectOpen(!inspectOpen)}
        role="button"
        tabIndex={0}
      >
        {cat.avatarUrl ? null : catInitials(cat.name)}
      </div>
      {inspectOpen ? (
        <CatInspectPanel
          cat={{
            id: cat.catId,
            name: cat.name,
            avatarColor: cat.avatarColor,
            avatarUrl: cat.avatarUrl,
            provider: cat.execution.target.provider,
            instance: cat.execution.target.instance,
            model: cat.execution.target.model,
            skillProfile: cat.skillProfile ?? null,
            isBoss,
          }}
          onClose={() => setInspectOpen(false)}
        />
      ) : null}
    </>
  );
}
