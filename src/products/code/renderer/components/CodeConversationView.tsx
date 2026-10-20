import { useState } from 'react';
import { browserLocalStorage } from '../../../../shared/browserStorage.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys as m } from '../../../../shared/i18n/messageKeys.js';
import { buildChatConversationId } from '../../../../shared/chatCoreIds.js';
import { ConversationView, type ConversationViewProps } from '../../../shared/renderer/components/conversation-view/ConversationView.js';
import { buildConversationSidePanelSections } from '../../../shared/renderer/components/conversation-view/ConversationSidePanelSections.js';
import { useCodeWorkAreas } from '../hooks/useCodeWorkAreas.js';
import { CodeWorkAreasPanel } from './CodeWorkAreasPanel.js';
import { loadCodeInspectionPreference, saveCodeInspectionPreference, type CodeInspectionPreference } from '../codeInspectionPreferences.js';

/** Code-only composition. Shared conversation/participant components receive generic hooks. */
export function CodeConversationView(props: ConversationViewProps) {
  const { t } = useI18n();
  const { selectedChannel, payload } = props;
  const started = selectedChannel.messages.length > 0;
  const state = useCodeWorkAreas(buildChatConversationId(selectedChannel.id), started);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [panel, setPanel] = useState(() => loadCodeInspectionPreference(
    browserLocalStorage(), payload.scopeId, selectedChannel.id));
  const updatePanel = (update: Partial<CodeInspectionPreference>) => setPanel(previous => {
    const next = { ...previous, ...update };
    saveCodeInspectionPreference(browserLocalStorage(),
      payload.scopeId, selectedChannel.id, next);
    return next;
  });
  return <ConversationView {...props}
    sidePanelState={{ ...panel, onOpenChange: open => updatePanel({ open }), onSectionChange: section => updatePanel({ section }) }}
    buildParticipantInspectionAction={(id, openSection) => {
      const participant = state.data?.participants.find(entry => entry.participantId === id);
      const repositories = participant?.repositories ?? [];
      const executions = participant?.executions ?? [];
      const empty = state.status === 'loading' ? m.codeWorkAreasLoading
        : state.status === 'interrupted' ? m.codeWorkAreasInterrupted
          : executions.some(e => e.coverage.status === 'available') ? m.codeWorkAreasEmpty
            : executions.some(e => e.coverage.status === 'partial') ? m.codeWorkAreasPartial
              : state.status === 'unavailable' || executions.some(e => e.coverage.status === 'unavailable')
                ? m.codeWorkAreasUnavailable : m.codeWorkAreasNotReported;
      const summary = repositories.length ? repositories.slice(0, 2).map(repository =>
        `${repository.label ?? t(m.codeWorkAreasDirectory)} · ${t(repository.checkouts.some(c => c.kind === 'worktree')
          ? m.codeWorkAreasWorktree : repository.checkouts[0]?.kind === 'original'
            ? m.codeWorkAreasOriginal : repository.checkouts[0]?.kind === 'non_git'
              ? m.codeWorkAreasDirectory : m.codeWorkAreasUnknown)}`).join('; ')
        + (repositories.length > 2 ? ` +${repositories.length - 2}` : '') : t(empty);
      const continuity = state.status === 'interrupted' ? m.codeWorkAreasInterrupted
        : executions.length && executions.every(e => e.continuity !== 'current') ? m.codeWorkAreasLastKnown
          : executions.some(e => e.coverage.status === 'partial') ? m.codeWorkAreasPartial : null;
      return { label: t(m.codeWorkAreasView), hint: summary + (repositories.length && continuity ? ` · ${t(continuity)}` : ''),
        onSelect: () => { setSelectedParticipantId(id); setFocusRequest(value => value + 1); openSection('work-areas'); } };
    }}
    buildSidePanelSections={options => {
      const sections = buildConversationSidePanelSections(options);
      if (started) sections.splice(1, 0, { id: 'work-areas', title: t(m.codeWorkAreasTitle),
        children: <CodeWorkAreasPanel state={state} selectedParticipantId={selectedParticipantId} focusRequest={focusRequest}
          onFocusHandled={() => setFocusRequest(0)}
          onInspectRun={id => { options.onInspectRun(id); updatePanel({ open: true, section: 'operator' }); }} /> });
      return sections;
    }}
  />;
}
