import { messageKeys } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/useI18n.js';
import { useState } from 'react';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { ProviderConversationControls } from '../../../products/shared/renderer/components/provider-interactions/ProviderConversationControls.js';

/** Uses the existing Settings shell; inspecting does not activate a session. */
export function ProviderSessionSettings({ payload }: { payload: AppShellPayload }) {
  const { t } = useI18n();
  const channels = payload.chat.channels.filter(c => c.status !== 'archived');
  const [chosen, setChosen] = useState('');
  const selected = channels.find(c => c.id === chosen) ?? channels[0];
  return <section>
    <h3>{t(messageKeys.providerControlsSettingsTitle)}</h3>
    <p>{t(messageKeys.providerControlsSettingsHelp)}</p>
    <label>{t(messageKeys.providerControlsConversation)} <select value={selected?.id ?? ''} onChange={e => setChosen(e.target.value)}>
      {channels.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
    </select></label>
    {selected ? <ProviderConversationControls key={selected.id} conversationId={buildChatConversationId(selected.id)} initiallyOpen />
      : <p>{t(messageKeys.providerControlsStartConversation)}</p>}
  </section>;
}
