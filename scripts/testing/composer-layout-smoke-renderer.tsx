// Production composer components and styles; every service/record is an isolated fixture.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../src/app/renderer/i18n/index.js';
import { NewChatDraft as ChatDraft } from '../../src/products/chat/renderer/components/NewChatDraft.js';
import { NewChatDraft as CodeDraft } from '../../src/products/code/renderer/components/NewChatDraft.js';
import { NewChatDraft as WorkDraft } from '../../src/products/work/renderer/components/NewChatDraft.js';
import { ConversationView } from '../../src/products/shared/renderer/components/conversation-view/ConversationView.js';
import { ComposerSurfaceChip } from '../../src/products/shared/renderer/components/ComposerSurfaceChip.js';
import { PermissionModeChip } from '../../src/products/shared/renderer/components/PermissionModeChip.js';
import { useAppChrome } from '../../src/products/shared/renderer/hooks/useAppChrome.js';
import { clearBusyState } from '../../src/shared/workspaceBusy.js';
import { createDefaultRuntimeSessionPolicy } from '../../src/shared/runtimeSessionPolicy.js';
import type { AppShellPayload } from '../../src/products/shared/api/workspaceContracts.js';
import type { SelectedChannelView } from '../../src/products/shared/channelEntry.js';
import type { ConversationViewProps } from '../../src/products/shared/renderer/components/conversation-view/ConversationView.js';
import '../../src/design/index.css';
import '../../src/products/chat/renderer/styles.css';
import '../../src/products/code/renderer/styles.css';
import '../../src/products/work/renderer/styles.css';

interface Scenario {
  product: 'chat' | 'code' | 'work';
  preset: 'default' | 'group' | 'parallel';
  started: boolean;
  direct: boolean;
}
declare global {
  interface Window {
    __composerFixture: {
      select: (next: Scenario) => void; setDraft: (value: string) => void;
      setWide: (value: boolean) => void; wide: boolean; scenario: Scenario;
      expectedCode: string; expectedPath: string;
    };
  }
}
const fixture: {
  ids: string[]; groupId: string; directId: string;
  payloads: Record<string, AppShellPayload>;
  snapshots: Record<string, { selectedChannel: SelectedChannelView }>;
} = await (await fetch('/fixture.json')).json();
const noop = () => {};
const longPath = `C:/fixture/${'unbroken_path_segment_'.repeat(35)}output.png`;
const longCode = `const generatedFile = "${longPath}";`;
const tableFields = Array.from({ length: 32 }, (_, index) => `field_${index}`);
const wideReply = [
  'Wide content must stay inside this message.', '',
  `| ${tableFields.join(' | ')} |`,
  `| ${tableFields.map(() => '---').join(' | ')} |`,
  `| ${tableFields.map(() => 'value').join(' | ')} |`, '',
  '```ts', longCode, '```', '',
  `Long inline path: \`${longPath}\``, '',
  `https://example.test/${'unbroken_url_segment_'.repeat(35)}`,
].join('\n');
// All renderer reads stay in memory. A send only clears local React state.
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (init?.method && init.method !== 'GET') throw new Error(`Unexpected fixture write: ${url}`);
  if (url.includes('repo-probe')) return Response.json({ isRepo: false, repoRoot: null, branch: null });
  return Response.json({ state: 'ready', revision: 'fixture', providers: [], isRepo: false });
};

function App() {
  const [scenario, setScenario] = useState<Scenario>({ product: 'chat', preset: 'default', started: false, direct: false });
  const [draft, setDraft] = useState('');
  const [plusOpen, setPlusOpen] = useState(false);
  const [wide, setWide] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const plusRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { autoResize } = useAppChrome();
  const { product, preset, started, direct } = scenario;
  const selectedId = direct ? fixture.directId : preset === 'group' ? fixture.groupId : fixture.ids[0];
  const payload = structuredClone(fixture.payloads[selectedId]);
  const channel = structuredClone(fixture.snapshots[selectedId].selectedChannel);
  channel.repoPath = 'C:/fixture/project';
  channel.chatCwd = 'C:/fixture/project';
  channel.originSurface = product;
  const sourceMessage = channel.messages.at(-1);
  if (!sourceMessage) throw new Error('Conversation fixture must contain a message');
  channel.messages = Array.from({ length: 50 }, (_, index): SelectedChannelView['messages'][number] => ({
    ...sourceMessage, metadata: {},
    id: `layout-message-${index}`, senderKind: index % 2 ? 'user' : 'agent',
    senderName: index % 2 ? 'Test Owner' : 'Assistant',
    body: wide && index === 46 ? wideReply : wide && index === 47 ? longPath
      : index >= 48 ? 'Short reply.' : `Transcript ${index}: existing fixture reply.`,
  }));
  payload.chat.selectedChannel = channel;
  payload.chat.selectedChannelId = selectedId;
  payload.chat.advancedDraftControls = { chat: true, code: true, work: true };
  for (const cat of payload.chat.cats) cat.products = ['chat', 'code', 'work'];
  const target = { provider: 'codex', instance: 'native', model: 'model-1', modelSelection: null };
  const temps = preset === 'group' ? [0, 1].map(index => ({ participantId: `temp-${index}`, name: `Model ${index + 1}`, ...target })) : [];
  const parallelTargets = preset === 'parallel' ? [0, 1].map(index => ({ ...target, model: `model-${index + 1}`, cwd: null, audienceKeys: null, workflowShape: 'sequential' as const })) : undefined;
  window.__composerFixture = {
    select: (next: typeof scenario) => { setScenario(next); setDraft(''); setFiles([]); setPlusOpen(false); },
    setDraft, setWide, wide, scenario, expectedCode: longCode, expectedPath: longPath,
  };
  const send = (event: React.FormEvent) => { event.preventDefault(); setDraft(''); setFiles([]); setPlusOpen(false); };
  const Draft = product === 'code' ? CodeDraft : product === 'work' ? WorkDraft : ChatDraft;
  const compareGroup: ConversationViewProps['compareGroup'] = preset === 'parallel' ? {
    id: 'fixture-parallel', title: 'Parallel fixture', mode: 'parallel', status: 'active', memberCount: 2,
    memberChannelIds: fixture.ids.slice(0, 2), createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', lastMessageAt: null,
    members: fixture.ids.slice(0, 2).map((id, index) => ({
      channelId: id, ...target, title: id, index, lastMessageAt: null,
    })),
  } : null;
  return <div className="screen claudeShell">
    <aside className="sidebar" style={{ padding: 20 }}>
      <strong>Isolated composer fixture</strong>
      <p>{product} / {preset} / {started ? 'started' : 'draft'}</p>
      <button id="clear-draft" onClick={() => setDraft('')}>Clear draft</button>
      <button id="restore-draft" onClick={() => setDraft('restored draft\n'.repeat(20))}>Restore draft</button>
      <button id="attach-fixture" onClick={() => setFiles([new File(['fixture'], 'fixture.txt')])}>Attach fixture</button>
    </aside>
    <main className="canvas">
      <React.Fragment key={`${product}-${preset}-${started}-${direct}`}>
        {started ? <ConversationView
          payload={payload} selectedChannel={channel} behaviorSurface={product}
          operatorSnapshot={null} operatorLoading={false} operatorError=""
          composerDraft={draft} busy={clearBusyState()} feedback="" greeting="Fixture"
          channelFiles={files} channelPlusMenuOpen={plusOpen} channelPlusMenuRef={plusRef}
          channelFileInputRef={fileRef} activeAssignedCats={channel.assignedCats}
          onComposerChange={setDraft} onComposerKeyDown={noop} onSendMessage={send}
          onToggleChannelPlusMenu={() => setPlusOpen(value => !value)} onChannelFileSelect={noop}
          onChannelFilesChange={setFiles} onApprovalDecision={noop} onChoiceSubmit={noop}
          onOperatorAction={noop} autoResize={autoResize} onSelect={noop} onOpenAddCat={noop}
          activeWorkflowShape="sequential" onToggleActiveWorkflowShape={noop}
          renderComposerHeaderAccessory={() => <PermissionModeChip value="full" onChange={noop} />}
          renderComposerSurfaceTag={() => <ComposerSurfaceChip surface={product} />}
          compareGroup={compareGroup} compareSendScope="active_only"
        /> : <Draft
          payload={payload} composerDraft={draft} busy={clearBusyState()} greeting="Fixture draft"
          draftFiles={files} draftCwd="C:/fixture/project" draftCatIds={direct ? [payload.chat.cats[0].id] : []}
          draftTemporaryParticipants={temps} plusMenuOpen={plusOpen} plusMenuRef={plusRef} fileInputRef={fileRef}
          onComposerChange={setDraft} onComposerKeyDown={noop} onSendMessage={send}
          onTogglePlusMenu={() => setPlusOpen(value => !value)} onFileSelect={noop} onPickFolder={noop}
          onOpenAddCat={noop} onDraftFilesChange={setFiles} onDraftCwdClear={noop} onToggleDraftCat={noop}
          onAddDraftTemporaryParticipant={noop} onRemoveDraftTemporaryParticipant={noop}
          onUpdateDraftTemporaryParticipant={noop} autoResize={autoResize}
          draftDefaultRecipientCatId={direct ? payload.chat.cats[0].id : null}
          entryPreset={preset} selectedExecutionTarget={target} onExecutionTargetChange={noop}
          draftHighlightedCatId={null} draftCatExecutionTargetOverrides={new Map()} onDraftCatExecutionTargetOverride={noop}
          parallelTargets={parallelTargets} onParallelTargetChange={noop} onAddParallelTarget={noop} onRemoveParallelTarget={noop}
          draftRuntimeSessionPolicy={createDefaultRuntimeSessionPolicy()} onDraftRuntimeSessionPolicyChange={noop}
          draftSurface={product} onDraftSurfaceChange={noop}
          parallelBranchActions={{ onSetRuntimeSessionPolicy: noop, onPickFolder: noop, onSetCwd: noop }}
        />}
      </React.Fragment>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(
  <I18nProvider locale="en"><MemoryRouter><App /></MemoryRouter></I18nProvider>,
);
