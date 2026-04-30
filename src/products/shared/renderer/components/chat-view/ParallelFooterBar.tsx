import type { ParallelChatGroupSummary } from '../../../api/workspaceContracts.js';
import { presentChannelTitle } from '../../workspaceChatUtils.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

export interface ParallelFooterBarProps {
  compareMembers: ParallelChatGroupSummary['members'];
  selectedChannelId: string;
  comparePrevChannelId: string | null;
  compareNextChannelId: string | null;
  onSelect: (channelId: string) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
}

function buildParallelChatMemberLabel(
  member: ParallelChatGroupSummary['members'][number],
  defaultModelLabel: string,
  threadLabel: string,
): string {
  const provider = member.provider?.trim() || defaultModelLabel;
  const model = member.model?.trim();
  if (provider !== defaultModelLabel) {
    return model ? `${provider} · ${model}` : provider;
  }

  const title = member.title.trim();
  return title || threadLabel;
}

export function ParallelFooterBar({
  compareMembers,
  selectedChannelId,
  comparePrevChannelId,
  compareNextChannelId,
  onSelect,
  onNavigatePrev,
  onNavigateNext,
}: ParallelFooterBarProps) {
  const { t } = useI18n();
  const modelLabel = t(messageKeys.chatParallelFooterDefaultModelLabel);

  const resolveThreadLabel = (memberIndex: number): string =>
    t(messageKeys.chatParallelFooterThreadLabel, { threadIndex: memberIndex + 1 });

  return (
    <nav className="parallelFooterBar" aria-label={t(messageKeys.chatParallelFooterNavigationAriaLabel)}>
      <button
        className="parallelFooterNavButton"
        type="button"
        disabled={!comparePrevChannelId}
        onClick={onNavigatePrev}
        aria-label={t(messageKeys.chatParallelFooterPrevAriaLabel)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div className="parallelFooterTabs" role="tablist" aria-label={t(messageKeys.chatParallelFooterTabsAriaLabel)}>
        {compareMembers.map((member) => {
          const active = member.channelId === selectedChannelId;
          const label = buildParallelChatMemberLabel(
            member,
            modelLabel,
            resolveThreadLabel(member.index),
          );
          return (
            <button
              key={member.channelId}
              className={active ? 'parallelFooterTab parallelFooterTabActive' : 'parallelFooterTab'}
              type="button"
              role="tab"
              aria-selected={active}
              title={`${label} · ${presentChannelTitle(member.title, t)}`}
              onClick={() => onSelect(member.channelId)}
            >
              <span className="parallelFooterTabLabel">{label}</span>
            </button>
          );
        })}
      </div>
      <button
        className="parallelFooterNavButton"
        type="button"
        disabled={!compareNextChannelId}
        onClick={onNavigateNext}
        aria-label={t(messageKeys.chatParallelFooterNextAriaLabel)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </nav>
  );
}
