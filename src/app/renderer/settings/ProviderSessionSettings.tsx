import { useState } from 'react';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { ProviderConversationControls } from '../../../products/shared/renderer/components/provider-interactions/ProviderConversationControls.js';

/** Uses the existing Settings shell; inspecting does not activate a session. */
export function ProviderSessionSettings({ payload }: { payload: AppShellPayload }) {
  const channels = payload.chat.channels.filter(c => c.status !== 'archived');
  const [chosen, setChosen] = useState('');
  const selected = channels.find(c => c.id === chosen) ?? channels[0];
  return <section>
    <h3>Session access, Chrome and computer use</h3>
    <p>Select a conversation to inspect its current worker. Tools listed by a provider have not necessarily been connected or used.</p>
    <label>Conversation <select value={selected?.id ?? ''} onChange={e => setChosen(e.target.value)}>
      {channels.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
    </select></label>
    {selected ? <ProviderConversationControls key={selected.id} conversationId={buildChatConversationId(selected.id)} initiallyOpen />
      : <p>Start a conversation to obtain a session observation.</p>}
  </section>;
}
