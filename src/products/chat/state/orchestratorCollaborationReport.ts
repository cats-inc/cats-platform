import type { ChatState, ChatMessage } from '../api/contracts.js';
import type { MessageLocale } from '../../../shared/i18n/index.js';
import { parseMessageLocale } from '../../../shared/i18n/index.js';
import type { ProviderAgentBoundedObservation } from '../../../platform/orchestration/providerAgentDecision.js';
import { appendMessage } from './model/index.js';
import { collaborationSnapshot, DISCOVER_COLLABORATION_CATS, INSPECT_COLLABORATION_CONTEXT, type CollaborationReport,
  type CollaborationCandidate } from './orchestratorCollaboration.js';

export function appendCollaborationReport(input: {
  state: ChatState; channelId: string; sourceMessageId: string;
  report?: CollaborationReport; locale: MessageLocale; now: Date;
}): { state: ChatState; resultMessage: ChatMessage | null } {
  if (!input.report) return { state: input.state, resultMessage: null };
  const appended = appendMessage(input.state, input.channelId, {
    senderKind: 'orchestrator', senderName: 'Orchestrator',
    body: describeCollaborationReport(input.report, input.locale),
  }, input.now, { metadata: {
    event: 'orchestrator_collaboration_preparation', sourceMessageId: input.sourceMessageId,
    collaborationPreparation: input.report,
  }, incrementUnread: false });
  return { state: appended.state, resultMessage: appended.message };
}

export function describeCollaborationReport(report: CollaborationReport, locale: MessageLocale): string {
  const zh = locale === 'zh-TW';
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
    if (report.status === 'stopped') continue;
    if (snapshot?.revision === report.revision && latestUser?.id === input.sourceMessageId) continue;
    const stale: CollaborationReport = { ...report, status: 'stopped', reason: 'stale_context', preparation: undefined };
    message.metadata.collaborationPreparation = stale;
    message.body = describeCollaborationReport(stale, parseMessageLocale(channel?.responseLanguage) ?? 'en');
  }
  return result;
}
