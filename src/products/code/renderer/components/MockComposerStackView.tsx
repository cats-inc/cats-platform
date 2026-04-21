import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import {
  CollaborateIcon,
  CompareIcon,
} from '../../../shared/renderer/components/DraftBuilderIcons.js';

interface MockAgent {
  id: string;
  label: string;
  tint: string;
}

interface MockCard {
  id: string;
  prompt: string;
  cwd: string | null;
  branch: string | null;
  agents: MockAgent[];
}

const AGENT_LIBRARY: ReadonlyArray<Omit<MockAgent, 'id'>> = [
  { label: 'claude 4.7 opus', tint: '#6b4f8a' },
  { label: 'codex gpt-5', tint: '#3f6a5a' },
  { label: 'gemini 3 pro', tint: '#3a5a9a' },
  { label: 'deepseek r3', tint: '#7a4a6a' },
  { label: 'qwen 3 max', tint: '#8b4a3f' },
];

const MOCK_CWDS: ReadonlyArray<{ cwd: string; branch: string | null }> = [
  { cwd: '~/Source/SK2/cats-platform', branch: 'main' },
  { cwd: '~/Source/SK2/cats-platform', branch: 'feature-compare-stack' },
  { cwd: '~/Source/SK2/digital-company', branch: 'main' },
  { cwd: '~/Source/sandbox/tmp-experiment', branch: null },
];

let sequenceCounter = 0;
function nextId(prefix: string): string {
  sequenceCounter += 1;
  return `${prefix}-${sequenceCounter}`;
}

function createAgentFromLibrary(index: number): MockAgent {
  const seed = AGENT_LIBRARY[index % AGENT_LIBRARY.length];
  return { id: nextId('agent'), label: seed.label, tint: seed.tint };
}

function createCard(index: number): MockCard {
  const cwdSeed = MOCK_CWDS[index % MOCK_CWDS.length];
  return {
    id: nextId('card'),
    prompt: '',
    cwd: cwdSeed.cwd,
    branch: cwdSeed.branch,
    agents: [createAgentFromLibrary(index)],
  };
}

function truncatePath(path: string, max = 34): string {
  if (path.length <= max) return path;
  return `…${path.slice(path.length - max + 1)}`;
}

/**
 * Linear distance from active. Positive = to the right, negative = to
 * the left. No wrap: the first card (lead) has nothing on its left, the
 * last card has nothing on its right — matches the lead-branch
 * semantics of the underlying draft.
 */
function relativeCarouselPosition(
  index: number,
  activeIndex: number,
): number {
  return index - activeIndex;
}

export function MockComposerStackView() {
  const [cards, setCards] = useState<MockCard[]>(() => [createCard(0), createCard(1)]);
  const [activeIndex, setActiveIndex] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeIndex >= cards.length && cards.length > 0) {
      setActiveIndex(cards.length - 1);
    }
  }, [cards.length, activeIndex]);

  const updateCard = useCallback((cardId: string, patch: Partial<MockCard>) => {
    setCards((prev) => prev.map((card) => (card.id === cardId ? { ...card, ...patch } : card)));
  }, []);

  const removeAgent = useCallback((cardId: string, agentId: string) => {
    setCards((prev) => prev.map((card) => (
      card.id === cardId
        ? { ...card, agents: card.agents.filter((a) => a.id !== agentId) }
        : card
    )));
  }, []);

  const addAgent = useCallback((cardId: string) => {
    setCards((prev) => prev.map((card) => {
      if (card.id !== cardId) return card;
      const used = new Set(card.agents.map((a) => a.label));
      const nextSeedIndex = AGENT_LIBRARY.findIndex((seed) => !used.has(seed.label));
      const seedIndex = nextSeedIndex >= 0 ? nextSeedIndex : card.agents.length;
      return { ...card, agents: [...card.agents, createAgentFromLibrary(seedIndex)] };
    }));
  }, []);

  const addCard = useCallback(() => {
    setCards((prev) => {
      const next = [...prev, createCard(prev.length)];
      setActiveIndex(next.length - 1);
      return next;
    });
  }, []);

  const removeCard = useCallback((cardId: string) => {
    setCards((prev) => prev.filter((card) => card.id !== cardId));
  }, []);

  const cycleCwd = useCallback((cardId: string) => {
    setCards((prev) => prev.map((card) => {
      if (card.id !== cardId) return card;
      const currentIdx = MOCK_CWDS.findIndex(
        (seed) => seed.cwd === card.cwd && seed.branch === card.branch,
      );
      const nextIdx = (currentIdx + 1 + MOCK_CWDS.length) % MOCK_CWDS.length;
      const next = MOCK_CWDS[nextIdx];
      return { ...card, cwd: next.cwd, branch: next.branch };
    }));
  }, []);

  const clearCwd = useCallback((cardId: string) => {
    updateCard(cardId, { cwd: null, branch: null });
  }, [updateCard]);

  const goPrev = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((i) => Math.min(cards.length - 1, i + 1));
  }, [cards.length]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    }
  }

  const canAdd = cards.length < 5;
  const canRemove = cards.length > 1;

  return (
    <div
      ref={shellRef}
      className="viewShell viewShellDraft mockStackView"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <section className="draftShell mockStackDraftShell">
        <header className="mockStackHero">
          <h1 className="mockStackTitle">Mock compare carousel</h1>
          <p className="mockStackSubtitle">
            Horizontal 3D carousel: active composer centred, peeks rotate on either
            side with their own chrome attached. Bounded at the lead branch — no
            wrap-around. Click a side card or tap a dot to spin to it; use ←/→
            when focus is outside the textarea.
          </p>
        </header>

        <div className="mockStackCarousel">
          {cards.length > 1 ? (
            <button
              type="button"
              className="mockStackCarouselNav mockStackCarouselNavPrev"
              onClick={goPrev}
              disabled={activeIndex === 0}
              aria-label="Previous card"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          ) : null}

          {cards.map((card, index) => (
            <MockComposerCard
              key={card.id}
              card={card}
              taskLabel={`task ${index + 1}`}
              active={index === activeIndex}
              relative={relativeCarouselPosition(index, activeIndex)}
              canAdd={canAdd}
              canRemove={canRemove}
              onPromote={index === activeIndex ? undefined : () => setActiveIndex(index)}
              onPromptChange={(value) => updateCard(card.id, { prompt: value })}
              onAddAgent={() => addAgent(card.id)}
              onRemoveAgent={(agentId) => removeAgent(card.id, agentId)}
              onCycleCwd={() => cycleCwd(card.id)}
              onClearCwd={() => clearCwd(card.id)}
              onAddCard={addCard}
              onRemoveCard={() => removeCard(card.id)}
            />
          ))}

          {cards.length > 1 ? (
            <button
              type="button"
              className="mockStackCarouselNav mockStackCarouselNavNext"
              onClick={goNext}
              disabled={activeIndex >= cards.length - 1}
              aria-label="Next card"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : null}
        </div>

        {cards.length > 1 ? (
          <div className="mockStackDotRow" aria-label="Select compare card">
            {cards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                className={`mockStackDot${index === activeIndex ? ' mockStackDotActive' : ''}`}
                onClick={() => setActiveIndex(index)}
                aria-label={`Go to card ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

interface MockComposerCardProps {
  card: MockCard;
  taskLabel: string;
  active: boolean;
  relative: number;
  canAdd: boolean;
  canRemove: boolean;
  onPromote?: () => void;
  onPromptChange: (value: string) => void;
  onAddAgent: () => void;
  onRemoveAgent: (agentId: string) => void;
  onCycleCwd: () => void;
  onClearCwd: () => void;
  onAddCard: () => void;
  onRemoveCard: () => void;
}

function MockComposerCard({
  card,
  taskLabel,
  active,
  relative,
  canAdd,
  canRemove,
  onPromote,
  onPromptChange,
  onAddAgent,
  onRemoveAgent,
  onCycleCwd,
  onClearCwd,
  onAddCard,
  onRemoveCard,
}: MockComposerCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [card.prompt]);

  // Active card stays in the grid flow at identity transform — it drives
  // the grid cell height, which in turn drives the carousel's natural
  // height so chrome sits flush against the card. Peek cards overlay the
  // same grid cell via inline transform (translate sideways, rotateY into
  // depth, scale down); they don't affect layout because scale/rotate
  // aren't measured by grid.
  const absRel = Math.abs(relative);
  const sign = relative === 0 ? 0 : relative > 0 ? 1 : -1;
  const translatePercent = sign * (88 + (absRel - 1) * 28);
  const rotateDeg = -sign * (38 + (absRel - 1) * 10);
  const scale = Math.max(0.38, 0.55 - (absRel - 1) * 0.12);
  const opacity = Math.max(0.1, 0.64 - (absRel - 1) * 0.28);
  const zIndex = active ? 1000 : Math.max(1, 900 - absRel * 10);

  const wrapperStyle: CSSProperties = active
    ? { zIndex }
    : {
        transform: `translate(${translatePercent}%, 0) rotateY(${rotateDeg}deg) scale(${scale.toFixed(3)})`,
        opacity: opacity.toFixed(3),
        zIndex,
      };

  const className = active
    ? 'mockStackCardWrapper mockStackCardActive'
    : 'mockStackCardWrapper mockStackCardPeek';

  function handlePromoteClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (active || !onPromote) return;
    if (event.target instanceof HTMLElement && event.target.closest('button, textarea, [role="button"]')) {
      return;
    }
    onPromote();
  }

  return (
    <div
      className={className}
      style={wrapperStyle}
      aria-hidden={active ? undefined : true}
      onClick={handlePromoteClick}
    >
      <div className="composerHeaderRow mockStackCardHeader">
        <div className="composerHeaderLeft">
          <ComposerSurfaceChip surface="code" />
          {card.cwd ? (
            <span
              className="composerCwdChip composerCwdClickable"
              data-tooltip={card.cwd}
              role="button"
              tabIndex={active ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                if (active) onCycleCwd();
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
              </svg>
              <span>{truncatePath(card.cwd)}</span>
              <button
                type="button"
                className="composerChipClose"
                disabled={!active}
                onClick={(event) => {
                  event.stopPropagation();
                  if (active) onClearCwd();
                }}
                aria-label="Clear cwd"
              >
                &times;
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="composerHeaderChooseButton"
              disabled={!active}
              onClick={(event) => {
                event.stopPropagation();
                if (active) onCycleCwd();
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
              </svg>
              <span>Choose workspace</span>
            </button>
          )}
          {card.branch ? (
            <span className="composerBranchChip">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="4" cy="4" r="1.6" />
                <circle cx="12" cy="4" r="1.6" />
                <circle cx="4" cy="12" r="1.6" />
                <path d="M4 5.6v4.8" />
                <path d="M12 5.6v2.4a2 2 0 0 1-2 2H6" />
              </svg>
              <span>{card.branch}</span>
            </span>
          ) : null}
        </div>
      </div>

      <form
        className="composerCard composerCardFresh mockStackCardBody"
        onSubmit={(event) => event.preventDefault()}
      >
        <textarea
          ref={textareaRef}
          className="composerInput"
          rows={1}
          placeholder="What should this card build, fix, or investigate?"
          value={card.prompt}
          disabled={!active}
          onChange={(event) => {
            onPromptChange(event.target.value);
            const el = event.target;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
        />
        <div className="composerBottomRow mockStackCardBottomRow">
          <div className="composerLeftGroup">
            <div className="composerPlusWrapper">
              <button
                type="button"
                className="composerPlusButton"
                aria-label="Attach"
                disabled={!active}
                onClick={(event) => event.stopPropagation()}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3v10" />
                  <path d="M3 8h10" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              className="parallelAddButton"
              disabled={!active || card.agents.length >= AGENT_LIBRARY.length}
              onClick={(event) => {
                event.stopPropagation();
                if (active) onAddAgent();
              }}
              aria-label="Add agent to collaborate"
            >
              <CollaborateIcon />
            </button>
          </div>
          <div className="mockStackAgentRow">
            {card.agents.map((agent) => (
              <span
                key={agent.id}
                className="mockStackAgentChip"
                style={{ background: agent.tint }}
              >
                <span className="mockStackAgentLabel">{agent.label}</span>
                {card.agents.length > 1 ? (
                  <button
                    type="button"
                    className="mockStackAgentRemove"
                    disabled={!active}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (active) onRemoveAgent(agent.id);
                    }}
                    aria-label={`Remove ${agent.label}`}
                  >
                    &times;
                  </button>
                ) : null}
              </span>
            ))}
          </div>
          <button
            type="submit"
            className="composerSendButton"
            disabled={!active || card.prompt.trim().length === 0}
            aria-label="Send"
            onClick={(event) => event.stopPropagation()}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 13V3" />
              <path d="M3 7l5-5 5 5" />
            </svg>
          </button>
        </div>
      </form>

      <div className="composerFooterRow mockStackCardFooter">
        <div className="mockStackCardFooterLeft">
          <span className="mockStackTaskChip">
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
              <path d="M5 6.5l2 2 4-4" />
            </svg>
            <span>{taskLabel}</span>
          </span>
        </div>
        <div className="parallelAddRow parallelAddRowInline mockStackCardActions">
          {canRemove ? (
            <button
              type="button"
              className="mockStackCardRemove"
              disabled={!active}
              onClick={(event) => {
                event.stopPropagation();
                if (active) onRemoveCard();
              }}
              aria-label="Remove this compare card"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 8h8" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className="parallelAddButton"
            disabled={!active || !canAdd}
            onClick={(event) => {
              event.stopPropagation();
              if (active && canAdd) onAddCard();
            }}
            aria-label="Add compare card"
          >
            <CompareIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
