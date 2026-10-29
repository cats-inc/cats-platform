import assert from 'node:assert/strict';
import test from 'node:test';
import { readConversationPresentation, splitConversationPresentation } from '@cats-inc/platform-ui-web/contracts';
import { ConversationPresentationReducer } from '../src/shared/conversationPresentation.ts';
import { enrichConversationPresentation } from '../src/products/chat/shared/conversationPresentationView.ts';
import { reconcileConversationPresentationLive } from '../src/shared/conversationPresentationLive.ts';
import { createDispatchPresentationRecorder } from '../src/products/chat/state/runtime-dispatch/presentationRecorder.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { buildChatConversationId } from '../src/shared/chatCoreIds.ts';
import { applyLiveIndicatorEvent, createLiveIndicatorSegmentState, projectLiveIndicatorStateFromSegments } from '../src/shared/liveIndicator.ts';
import { readRuntimeNdjsonResponse } from '../src/runtime/clientStreams.ts';
import type { ChatChannelView, ChatMessage } from '../src/products/chat/api/contracts.ts';
import type { DispatchRequest } from '../src/products/chat/state/room-routing/runtime.ts';
import type { ChatStore } from '../src/products/chat/state/store.ts';

const block = (id: string, index: number, text: string, kind: 'text' | 'tool' | 'status' = 'text') => ({
  id, index, text, kind, status: 'streaming' as const, title: null, toolName: kind === 'tool' ? 'Read' : null,
  toolId: kind === 'tool' ? 'reused' : null,
});
const scope = { sourceMessageId: 'owner', targetStateId: 'target', targetId: 'cat', turnId: 'turn', laneId: 'lane' };
const channel = (messages: ChatMessage[] = []) => ({ id: 'channel', messages }) as ChatChannelView;
function message(metadata: Record<string, unknown>, body = 'beforeafter'): ChatMessage {
  return { id: 'final', channelId: 'channel', senderKind: 'agent', senderName: 'Cat', body,
    createdAt: '2026-10-30T00:00:01Z', mentions: [], metadata, usage: null };
}
function live() {
  return projectLiveIndicatorStateFromSegments([createLiveIndicatorSegmentState({ phase: 'streaming',
    ...scope, participantId: 'cat', catId: 'cat', catName: 'Cat', speakerLabel: 'Cat', segmentIndex: 0,
    contentBlocks: [{ ...block('text:2', 2, 'after more'), metadata: null }],
  })]);
}
function presentation() {
  return { version: 1 as const, id: 'presentation:dispatch', phase: 'streaming' as const,
    blocks: [block('text:0', 0, 'before'), block('tool:1', 1, 'file', 'tool'), block('text:2', 2, 'after')] };
}

test('raw plus cumulative block snapshots preserve order, tool details and execution-local identity exactly once', () => {
  const reducer = new ConversationPresentationReducer('execution-1');
  reducer.accept({ type: 'text', text: 'before' });
  reducer.accept({ type: 'content_block', block: block('text:0', 0, 'before') });
  reducer.accept({ type: 'tool_use', toolId: 'reused', toolName: 'Read', toolArgs: { path: 'file.txt' } });
  reducer.accept({ type: 'content_block', block: block('tool:1', 1, 'Read', 'tool') });
  reducer.accept({ type: 'tool_result', toolId: 'reused', text: 'result' });
  reducer.accept({ type: 'content_block', block: { ...block('tool:1', 1, 'result', 'tool'), status: 'complete' } });
  reducer.accept({ type: 'text', text: 'after' });
  reducer.accept({ type: 'content_block', block: block('text:2', 2, 'after') });
  reducer.accept({ type: 'content_block', block: block('text:2', 2, 'after more') });
  reducer.seal();
  const saved = reducer.snapshot();
  assert.deepEqual(saved.blocks.map(value => [value.kind, value.text]), [['text', 'before'], ['tool', 'result'], ['text', 'after more']]);
  assert.equal(saved.blocks[1].input, '{"path":"file.txt"}');
  assert.equal(saved.blocks[1].result, 'result');
  assert.equal(saved.phase, 'sealed');
  const next = new ConversationPresentationReducer('execution-2');
  next.accept({ type: 'tool_result', toolId: 'reused', text: 'another' });
  assert.equal(next.snapshot().blocks[0].input, undefined);
});

test('desktop tool and interaction payloads cannot leak through snapshots, titles, details or arbitrary metadata', () => {
  const reducer = new ConversationPresentationReducer('safe');
  reducer.accept({ type: 'tool_use', toolId: 'reused', toolName: 'clipboard_read', toolArgs: { text: 'SECRET' } });
  reducer.accept({ type: 'tool_result', toolId: 'reused', text: 'SECRET' });
  reducer.accept({ type: 'content_block', block: { ...block('tool:0', 0, 'SECRET', 'tool'),
    toolName: 'clipboard_read', title: 'SECRET', metadata: { screenshot: 'SECRET' } } });
  reducer.accept({ type: 'progress', text: 'SECRET', metadata: { kind: 'interaction_requested' } });
  reducer.accept({ type: 'content_block', block: { ...block('status:1', 1, 'SECRET', 'status'),
    metadata: { kind: 'interaction_requested' } } });
  assert.doesNotMatch(JSON.stringify(reducer.snapshot()), /SECRET|screenshot/);
});

test('final product text transforms keep tools and block identity; failed raw streams seal partial output', () => {
  const reducer = new ConversationPresentationReducer('raw');
  reducer.accept({ type: 'text', text: 'before directive' });
  reducer.accept({ type: 'tool_use', toolId: 'tool', toolName: 'Read', text: 'input' });
  reducer.accept({ type: 'text', text: 'after directive' });
  const ids = reducer.snapshot().blocks.map(value => value.id);
  reducer.replaceText(['before', 'after']);
  reducer.seal(true);
  assert.deepEqual(reducer.snapshot().blocks.map(value => value.id), ids);
  assert.deepEqual(reducer.snapshot().blocks.filter(value => value.kind === 'text').map(value => value.text), ['before', 'after']);
  assert.equal(reducer.snapshot().blocks[1].status, 'error');
});

test('execution recorder saves without a renderer, flushes on cancel and cannot imply text completion', async () => {
  let core = createDefaultCoreState();
  const store = { updateCore: async (mutate: Parameters<ChatStore['updateCore']>[0]) => { core = await mutate(core); return core; } };
  const request = { dispatchId: 'dispatch', turnId: 'turn', targetStateId: 'target', sourceMessage: { id: 'owner' },
    target: { laneId: 'lane', sessionId: 'session', participantId: 'cat', participantName: 'Cat' } } as DispatchRequest;
  const recorder = createDispatchPresentationRecorder(store, 'channel', request, new Date('2026-10-30T00:00:00Z'));
  recorder.accept({ type: 'text', text: 'partial' });
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.equal(core.segments.length, 1);
  assert.equal(core.segments[0].status, 'streaming');
  await recorder.seal(true);
  assert.equal(core.segments[0].kind, 'status');
  assert.equal(core.segments[0].content, null);
  assert.equal(core.segments[0].metadata.presentationRevision, 2);
  const reopened = enrichConversationPresentation(channel(), core);
  assert.equal(reopened.messages.length, 1);
  assert.equal(reopened.messages[0].body, 'partial');
  assert.equal(readConversationPresentation(reopened.messages[0].metadata.presentation)?.phase, 'sealed');
});

test('reopened snapshot enriches only its channel/target and final text replaces the snapshot once', () => {
  const core = createDefaultCoreState();
  core.segments.push({ id: 'presentation:dispatch', conversationId: buildChatConversationId('channel'),
    turnId: 'turn', laneId: 'lane', sessionId: 'session', kind: 'status', content: null, sequence: 0,
    status: 'complete', createdAt: '2026-10-30T00:00:00Z', completedAt: null,
    metadata: { ...scope, event: 'conversation_presentation', channelId: 'channel', presentation: presentation() } });
  const retained = enrichConversationPresentation(channel(), core);
  assert.equal(retained.messages.length, 1);
  const terminal = message({ ...scope, event: 'assistant_turn_segment', terminal: true,
    presentation: { ...presentation(), phase: 'sealed' } });
  assert.deepEqual(enrichConversationPresentation(channel([terminal]), core).messages, [terminal]);
  assert.equal(enrichConversationPresentation({ ...channel(), id: 'other' }, core).messages.length, 0);
  const rejected = message({ ...scope, event: 'assistant_finalization_rejected' }, 'Rejected');
  assert.deepEqual(enrichConversationPresentation(channel([rejected]), core).messages, [rejected]);
});

test('live SSE seeds missing history, replaces snapshots by id, and yields to a durable sealed result', () => {
  const saved = message({ ...scope, presentation: presentation() });
  const merged = reconcileConversationPresentationLive([saved], live());
  assert.equal(merged.messages.length, 0);
  assert.deepEqual(merged.live?.segments.flatMap(segment => segment.contentBlocks.map(value => value.text)), ['before', 'file', 'after more']);
  assert.equal(merged.live?.segments[0].id, 'presentation:dispatch:segment:text:0');
  const final = message({ ...scope, presentation: { ...presentation(), phase: 'sealed' } });
  const completed = reconcileConversationPresentationLive([final], live());
  assert.deepEqual(completed.messages, [final]);
  assert.equal(completed.live?.active, false);
  const foreign = message({ ...scope, targetStateId: 'other', laneId: 'other', presentation: presentation() });
  assert.equal(reconcileConversationPresentationLive([foreign], live()).messages.length, 1);
});

test('NDJSON observer captures partial/error before rejection without changing existing result aggregation', async () => {
  const reducer = new ConversationPresentationReducer('error');
  await assert.rejects(readRuntimeNdjsonResponse(new Response([
    { type: 'text', text: 'partial' }, { type: 'error', text: 'failed' },
  ].map(value => JSON.stringify(value)).join('\n')), { onMessageEvent: event => reducer.accept(event) }), /failed/);
  reducer.seal(true);
  assert.deepEqual(reducer.snapshot().blocks.map(value => value.text), ['partial', 'failed']);
});

test('long live replies retain every text/tool block while bounding incidental status chatter', () => {
  let state = projectLiveIndicatorStateFromSegments(live().segments.map(segment => ({ ...segment, contentBlocks: [] })));
  for (let index = 0; index < 35; index++) {
    state = applyLiveIndicatorEvent(state, 'content_block', { ...scope,
      block: block(`text:${index}`, index, `chunk ${index}`) });
  }
  const blocks = state.segments.flatMap(segment => segment.contentBlocks);
  assert.equal(blocks.filter(value => value.kind === 'text').length, 35);
  assert.equal(blocks[0].text, 'chunk 0');
});

test('multiple SSE segments merge once and preserve Desktop text/tool grouping through reopen', () => {
  const saved = message({ ...scope, presentation: presentation() });
  const source = projectLiveIndicatorStateFromSegments(presentation().blocks.map((value, index) =>
    createLiveIndicatorSegmentState({ ...scope, participantId: 'cat', catId: 'cat', catName: 'Cat',
      speakerLabel: 'Cat', phase: index === 2 ? 'streaming' : 'sealed', segmentIndex: index,
      contentBlocks: [{ ...value, metadata: null }] })));
  const merged = reconcileConversationPresentationLive([saved], source).live!;
  assert.deepEqual(merged.segments.map(segment => segment.contentBlocks.map(value => value.id)), [['text:0'], ['tool:1', 'text:2']]);
  assert.deepEqual(merged.segments.map(segment => segment.id), splitConversationPresentation(presentation()).map(part => part.id));
  assert.equal(new Set(merged.segments.map(segment => segment.id)).size, 2);
});

test('a delayed SSE prefix or running tool cannot regress a newer durable snapshot', () => {
  const retained = presentation();
  retained.blocks[2].text = 'after more saved text';
  const terminalTool = { ...retained.blocks[1], status: 'error' as const };
  const saved = message({ ...scope, presentation: { ...retained, blocks: [retained.blocks[0], terminalTool, retained.blocks[2]] } });
  const state = live();
  state.segments[0].contentBlocks.unshift({ ...block('tool:1', 1, 'running', 'tool'), metadata: null });
  const merged = reconcileConversationPresentationLive([saved], state).live!.segments.flatMap(segment => segment.contentBlocks);
  assert.equal(merged.find(block => block.id === 'text:2')?.text, 'after more saved text');
  assert.equal(merged.find(block => block.id === 'tool:1')?.status, 'error');
});

test('final transforms reconcile Runtime text merged across tool results without leaking directives', () => {
  const reducer = new ConversationPresentationReducer('merged');
  reducer.accept({ type: 'tool_use', toolId: 'reused', toolName: 'Read', text: 'input' });
  reducer.accept({ type: 'content_block', block: { ...block('tool:0', 0, 'input', 'tool'), status: 'error' } });
  reducer.accept({ type: 'content_block', block: block('text:1', 1, 'before directiveafter directive') });
  reducer.replaceText(['before', 'after'], [
    { kind: 'tool_use', text: 'input', toolId: 'reused', toolName: 'Read' },
    { kind: 'text', text: 'before directive', toolId: null, toolName: null },
    { kind: 'tool_result', text: 'result', toolId: 'reused', toolName: 'Read' },
    { kind: 'text', text: 'after directive', toolId: null, toolName: null },
  ]);
  reducer.seal();
  assert.deepEqual(reducer.snapshot().blocks.map(value => value.text), ['result', 'before', 'after']);
  assert.equal(reducer.snapshot().blocks[0].input, 'input');
  assert.equal(reducer.snapshot().blocks[0].id, 'tool:0');
  assert.equal(reducer.snapshot().blocks[0].status, 'error');
  assert.doesNotMatch(JSON.stringify(reducer.snapshot()), /directive/);
});

test('recorder retries a failed write and surfaces persistent durability failure on seal', async () => {
  let fail = true;
  let core = createDefaultCoreState();
  const request = { dispatchId: 'retry', turnId: 'turn', targetStateId: 'target', sourceMessage: { id: 'owner' },
    target: { laneId: 'lane', sessionId: 'session', participantId: 'cat', participantName: 'Cat' } } as DispatchRequest;
  const recorder = createDispatchPresentationRecorder({ updateCore: async mutate => {
    if (fail) throw new Error('disk full');
    core = await mutate(core); return core;
  } }, 'channel', request, new Date());
  recorder.accept({ type: 'text', text: 'partial' });
  await assert.rejects(recorder.seal(), /disk full/);
  fail = false;
  assert.equal((await recorder.seal()).phase, 'sealed');
  assert.equal(core.segments.length, 1);
});

test('final reconciliation preserves each anonymous tool input without treating null as a shared id', () => {
  const reducer = new ConversationPresentationReducer('anonymous');
  reducer.accept({ type: 'tool_use', toolName: 'Read', text: 'A' });
  reducer.accept({ type: 'tool_use', toolName: 'Write', text: 'B' });
  reducer.accept({ type: 'text', text: 'joined' });
  reducer.replaceText(['before', 'after'], [
    { kind: 'tool_use', toolName: 'Read', toolId: null, text: 'A' },
    { kind: 'text', toolName: null, toolId: null, text: 'before' },
    { kind: 'tool_use', toolName: 'Write', toolId: null, text: 'B' },
    { kind: 'text', toolName: null, toolId: null, text: 'after' },
  ]);
  const saved = reducer.snapshot();
  assert.deepEqual(saved.blocks.filter(block => block.kind === 'tool').map(block => [block.toolName, block.input]), [['Read', 'A'], ['Write', 'B']]);
  assert.equal(new Set(saved.blocks.map(block => block.id)).size, saved.blocks.length);
});
