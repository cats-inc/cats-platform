export interface CompanionModeToggleChipProps {
  companionMode: boolean;
  onToggle: () => void;
}

export function CompanionModeToggleChip({
  companionMode,
  onToggle,
}: CompanionModeToggleChipProps) {
  return (
    <div className="companionModeToggle" role="group" aria-label="Direct lane view">
      <button
        type="button"
        className="channelActionIconButton companionModeToggleSegment"
        aria-pressed={!companionMode}
        aria-label="Chat view"
        data-tooltip="Chat view"
        onClick={() => {
          if (companionMode) {
            onToggle();
          }
        }}
      >
        <svg
          className="channelActionIconGlyph"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 4.5a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11H4a1.5 1.5 0 0 1-1.5-1.5z" />
        </svg>
      </button>
      <button
        type="button"
        className="channelActionIconButton companionModeToggleSegment"
        aria-pressed={companionMode}
        aria-label="Companion view"
        data-tooltip="Companion view"
        onClick={() => {
          if (!companionMode) {
            onToggle();
          }
        }}
      >
        <svg
          className="channelActionIconGlyph"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="6" r="2.75" />
          <path d="M2.75 13.25a5.25 5.25 0 0 1 10.5 0" />
        </svg>
      </button>
    </div>
  );
}
