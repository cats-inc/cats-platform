import type { ParallelChatGroupSummary } from '../../../api/workspaceContracts.js';
import { presentChannelTitle } from '../../workspaceChatUtils.js';

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
): string {
  const provider = member.provider?.trim() || 'Model';
  const model = member.model?.trim();
  if (provider !== 'Model') {
    return model ? `${provider} · ${model}` : provider;
  }

  const title = member.title.trim();
  return title || `Thread ${member.index + 1}`;
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
  return (
    <nav className="parallelFooterBar" aria-label="Parallel chat navigation">
      <button
        className="parallelFooterNavButton"
        type="button"
        disabled={!comparePrevChannelId}
        onClick={onNavigatePrev}
        aria-label="Previous parallel chat"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div className="parallelFooterTabs" role="tablist" aria-label="Parallel chats">
        {compareMembers.map((member) => {
          const active = member.channelId === selectedChannelId;
          const label = buildParallelChatMemberLabel(member);
          return (
            <button
              key={member.channelId}
              className={active ? 'parallelFooterTab parallelFooterTabActive' : 'parallelFooterTab'}
              type="button"
              role="tab"
              aria-selected={active}
              title={`${label} · ${presentChannelTitle(member.title)}`}
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
        aria-label="Next parallel chat"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </nav>
  );
}
