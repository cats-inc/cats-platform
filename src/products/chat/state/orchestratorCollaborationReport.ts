import type { ChatState, ChatMessage } from '../api/contracts.js';
import type { CatsCoreState } from '../../../core/types.js';
import { readCollaborationIntent, collaborationSummary } from '../../work/state/collaborationRecords.js';
import type { MessageLocale } from '../../../shared/i18n/index.js';
import { parseMessageLocale } from '../../../shared/i18n/index.js';
import type { ProviderAgentBoundedObservation } from '../../../platform/orchestration/providerAgentDecision.js';
import { appendMessage } from './model/index.js';
import { ACCEPT_COLLABORATION } from './collaborationExecutionSurface.js';
import { collaborationSnapshot, DISCOVER_COLLABORATION_CATS, INSPECT_COLLABORATION_CONTEXT, type CollaborationReport,
  type CollaborationCandidate } from './orchestratorCollaboration.js';

export function appendCollaborationReport(input: {
  state: ChatState; channelId: string; sourceMessageId: string;
  report?: CollaborationReport; locale: MessageLocale; now: Date;
  canExecute?: boolean;
}): { state: ChatState; resultMessage: ChatMessage | null } {
  if (!input.report) return { state: input.state, resultMessage: null };
  const appended = appendMessage(input.state, input.channelId, {
    senderKind: 'orchestrator', senderName: 'Orchestrator',
    body: describeCollaborationReport(input.report, input.locale),
  }, input.now, {
    ...(input.canExecute && input.report.status === 'prepared'
      && input.report.preparation?.status === 'prepared'
      && input.report.preparation.executionRevision && !input.report.preparation.goalTruncated
      ? { choices: [{ question: input.locale === 'zh-TW' ? '依此範圍與預算執行協作？' : 'Execute this scope and budget?',
          options: [{ id: ACCEPT_COLLABORATION,
            label: input.locale === 'zh-TW' ? '執行方案' : 'Execute proposal', style: 'primary' as const },
          { id: 'decline_collaboration', label: input.locale === 'zh-TW' ? '暫不執行' : 'Not now' }],
          multiSelect: false, allowCustom: false, allowSkip: true }] } : {}),
    metadata: {
    event: 'orchestrator_collaboration_preparation', sourceMessageId: input.sourceMessageId,
    collaborationPreparation: input.report,
  }, incrementUnread: false });
  return { state: appended.state, resultMessage: appended.message };
}

export function describeCollaborationReport(report: CollaborationReport, locale: MessageLocale): string {
  const zh = locale === 'zh-TW';
  if (report.execution) {
    const result = report.execution;
    return [zh ? '協作執行狀態：' : 'Collaboration execution:',
      result.conversationId ? (zh ? '對話已確認。' : 'Conversation verified.') : (zh ? '尚未建立對話。' : 'No conversation created.'),
      result.membershipVerified ? (zh ? '兩位同伴的成員身分已確認。' : 'Both participant memberships verified.') : (zh ? '成員安排尚未完成。' : 'Membership is incomplete.'),
      result.implementationEvidence ? (zh ? '實作已產生經確認的版本。' : 'Implementation produced a verified revision.')
        : (zh ? '實作尚無已確認的版本。' : 'No verified implementation revision yet.'),
      result.review ? (zh ? `審查結論：${result.review.verdict === 'approved' ? '通過' : '需要修改'}。${result.review.summary}`
        : `Reviewer verdict: ${result.review.verdict}. ${result.review.summary}`)
        : (zh ? '審查尚未完成。' : 'Review is incomplete.'),
      ...(result.status === 'blocked' || result.status === 'cancelled'
        ? [zh ? '協作已停止；已建立的對話、工作與產物會保留。' : 'Collaboration stopped; created conversations, work and evidence are retained.'] : []),
      zh ? '版本確認不代表測試通過；審查結論來自所選審查者。' : 'Revision verification does not prove tests passed; the verdict is attributed to the selected reviewer.',
    ].join('\n');
  }
  const clean = (value: string) => value.replace(/[\r\n]/gu, ' ');
  const preparation = report.preparation;
  let body: string;
  if (report.status === 'prepared' && preparation?.status === 'prepared') {
    body = zh ? [
      '協作提案已準備好：',
      `實作：${clean(preparation.implementer.name)}；審查：${clean(preparation.reviewer.name)}。`,
      preparation.conversation.intent === 'create' ? '建議建立新的 Chat 對話。' : '建議沿用目前的 Chat 對話。',
      `預期產出：${clean(preparation.expectedOutput)}`,
      '交接範圍是本次目標與目前對話；審查須等實作產物或版本確認後開始。',
      `建議預算：${preparation.budget.maxDurationMs / 1000} 秒、${preparation.budget.maxTokens} tokens，執行時仍需核定。`,
      '角色依 Cat 的設定選擇；實際執行能力與權限仍需確認。目前尚未建立對話、加入成員或啟動工作。',
    ].join('\n') : [
      'Collaboration proposal prepared:',
      `Implementation: ${clean(preparation.implementer.name)}; review: ${clean(preparation.reviewer.name)}.`,
      preparation.conversation.intent === 'create' ? 'Propose a new Chat conversation.' : 'Propose reusing this Chat conversation.',
      `Expected output: ${clean(preparation.expectedOutput)}`,
      'Handoff includes this goal and current conversation only. Review waits for a verified implementation artifact or revision.',
      `Suggested budget: ${preparation.budget.maxDurationMs / 1000} seconds, ${preparation.budget.maxTokens} tokens; not admitted for execution.`,
      'Roles are declared settings; execution capabilities and permissions still need checking. No conversation, membership or work has been created or started.',
    ].join('\n');
  } else if (preparation?.status === 'needs_input') {
    body = (zh ? '準備協作還需要以下資訊：\n' : 'Collaboration needs this information:\n')
      + preparation.reasons.map(clean).join('\n');
  } else if (preparation?.status === 'unavailable') {
    body = zh ? '目前尚無兩位已選定且執行設定可用的同伴。請先補齊同伴或其執行設定；工作尚未啟動。'
      : 'Two suitable Cats with available execution settings have not been selected. Resolve the teammate or provider gap first; no work has started.';
  } else if (report.status === 'stopped') {
    const reason = report.reason === 'stale_context'
      ? (zh ? '對話或同伴設定已改變，需要重新查詢。' : 'Conversation or teammate settings changed; a fresh lookup is needed.')
      : report.reason === 'cancelled'
        ? (zh ? '這次準備已取消。' : 'This preparation was cancelled.')
        : report.reason === 'budget_exhausted'
          ? (zh ? '準備協作已達到目前的時間或 token 上限。' : 'Collaboration preparation reached its time or token limit.')
          : report.reason === 'usage_unavailable'
            ? (zh ? '無法確認模型用量，這次準備已停止。' : 'Model usage could not be confirmed; preparation has stopped.')
            : (zh ? '這次準備未完成，已停止查詢。' : 'This preparation did not finish; discovery has stopped.');
    body = reason + (zh ? '尚未建立對話、加入成員或啟動工作。' : ' No conversation, membership or work has been created or started.');
  } else {
    const candidates = report.receipts.flatMap((receipt) => {
      if (receipt.toolName !== DISCOVER_COLLABORATION_CATS || receipt.result.status !== 'applied') return [];
      return (receipt.result.result as { candidates: CollaborationCandidate[] }).candidates;
    });
    const names = [...new Set(candidates.map((cat) => clean(cat.name)))].join(', ');
    const inspected = report.receipts.some((receipt) => receipt.toolName === INSPECT_COLLABORATION_CONTEXT
      && receipt.result.status === 'applied');
    const description = inspected ? (zh ? '已查看目前對話。' : 'Current conversation inspected.') : '';
    body = zh ? `${description}${names ? `找到同伴：${names}。` : ''}協作安排尚未完成，也尚未啟動工作。角色是設定資料，能力仍需確認。`
      : `${description}${names ? ` Discovered Cats: ${names}.` : ''} Collaboration preparation is incomplete; no work has started. Roles are declared settings, not verified capabilities.`;
  }
  return body;
}

/** Called inside the existing merge writer's mutation gate, immediately before publication. */
export function revalidateCollaborationPublication(input: {
  latestState: ChatState; dispatchState: ChatState; channelId: string;
  observation: ProviderAgentBoundedObservation; sourceMessageId: string;
  latestCore?: CatsCoreState;
}): ChatState {
  const channel = input.latestState.channels.find((entry) => entry.id === input.channelId);
  const snapshot = collaborationSnapshot(input.latestState, input.channelId, input.observation);
  const latestUser = channel?.messages.filter((message) => message.senderKind === 'user').at(-1);
  const result = structuredClone(input.dispatchState);
  for (const message of result.channels.find((entry) => entry.id === input.channelId)?.messages ?? []) {
    if (channel?.messages.some((existing) => existing.id === message.id)) continue;
    if (message.metadata?.sourceMessageId !== input.sourceMessageId
      || message.metadata.event !== 'orchestrator_collaboration_preparation') continue;
    const report = message.metadata.collaborationPreparation as CollaborationReport;
    if (report.execution && input.latestCore) {
      const intent = readCollaborationIntent(input.latestCore, report.execution.intentId);
      if (intent?.sourceChannelId === input.channelId) {
        const current = { ...report, execution: collaborationSummary(intent) };
        message.metadata.collaborationPreparation = current;
        message.body = describeCollaborationReport(current, parseMessageLocale(channel?.responseLanguage) ?? 'en');
      }
      continue;
    }
    if (report.status === 'stopped' || report.execution) continue;
    if (snapshot?.revision === report.revision && latestUser?.id === input.sourceMessageId) continue;
    const stale: CollaborationReport = { ...report, status: 'stopped', reason: 'stale_context', preparation: undefined };
    message.metadata.collaborationPreparation = stale;
    message.body = describeCollaborationReport(stale, parseMessageLocale(channel?.responseLanguage) ?? 'en');
  }
  return result;
}
