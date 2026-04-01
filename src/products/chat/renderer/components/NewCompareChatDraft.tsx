import { type FormEvent, type KeyboardEvent } from 'react';

import type { AppShellPayload } from '../../api/contracts';
import { buildConcurrentChatMemberLabel } from '../../shared/concurrentChats';
import {
  buildModelSelectorLabel,
  type ModelSelectorValue,
} from './ModelSelector';
import { ProviderModelFields } from './ProviderModelFields';

export interface NewCompareChatDraftProps {
  payload: AppShellPayload;
  composerDraft: string;
  busy: string;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  autoResize: (element: HTMLTextAreaElement) => void;
  targets: ModelSelectorValue[];
  onTargetChange: (index: number, value: ModelSelectorValue) => void;
  onAddTarget: () => void;
  onRemoveTarget: (index: number) => void;
}

export function NewCompareChatDraft({
  payload,
  composerDraft,
  busy,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  autoResize,
  targets,
  onTargetChange,
  onAddTarget,
  onRemoveTarget,
}: NewCompareChatDraftProps) {
  const draftBusy = busy === 'concurrent:dispatch' || busy === 'message:prepare';

  return (
    <div className="viewShell viewShellDraft compareDraftShell">
      <section className="draftShell compareDraftContent">
        <div className="draftGreeting compareDraftGreeting">
          <p className="eyebrow">Parallel Chat</p>
          <h1>Ask multiple models at once</h1>
          <p className="heroNote">
            Each model gets its own private thread. You can compare, challenge,
            and relay replies without turning the room into one shared group chat.
          </p>
        </div>

        <section className="compareTargetGrid" aria-label="Parallel targets">
          {targets.map((target, index) => (
            <article key={`${target.provider}:${target.instance ?? ''}:${index}`} className="compareTargetCard">
              <div className="compareTargetCardHeader">
                <div>
                  <strong>{buildConcurrentChatMemberLabel(target)}</strong>
                  <p>{buildModelSelectorLabel(target)}</p>
                </div>
                <button
                  type="button"
                  className="compareTargetRemove"
                  disabled={draftBusy || targets.length <= 2}
                  onClick={() => onRemoveTarget(index)}
                >
                  Remove
                </button>
              </div>
              <ProviderModelFields
                provider={target.provider}
                instance={target.instance ?? ''}
                model={target.model ?? ''}
                modelSelection={target.modelSelection}
                onTargetChange={(nextTarget) => {
                  onTargetChange(index, {
                    provider: nextTarget.provider,
                    instance: nextTarget.instance || null,
                    model: nextTarget.model || null,
                    modelSelection: nextTarget.modelSelection ?? null,
                  });
                }}
              />
            </article>
          ))}
        </section>

        <div className="compareTargetActions">
          <button
            type="button"
            className="operatorActionButton"
            disabled={draftBusy}
            onClick={onAddTarget}
          >
            Add model
          </button>
          <span className="composerHint">
            {targets.length} parallel chats will receive the first message.
          </span>
        </div>

        <form className="composerCard composerCardFresh compareDraftComposer" onSubmit={(event) => void onSendMessage(event)}>
          <textarea
            className="composerInput"
            rows={1}
            placeholder="Ask the same question across multiple models..."
            value={composerDraft}
            onChange={(event) => { onComposerChange(event.target.value); autoResize(event.target); }}
            onKeyDown={(event) => void onComposerKeyDown(event)}
          />
          <div className="composerBottomRow">
            <div className="composerLeftGroup">
              <span className="compareTargetCountChip">{targets.length} chats</span>
            </div>
            <button
              className="composerSendButton"
              disabled={!composerDraft.trim() || draftBusy || targets.length < 2}
              type="submit"
              aria-label="Send to parallel chat"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 13V3" />
                <path d="M3 7l5-5 5 5" />
              </svg>
            </button>
          </div>
        </form>

        {payload.chat.concurrentGroups.length > 0 ? (
          <p className="compareDraftFootnote">
            Parallel chats stay grouped in Recents, and each reply can be relayed into
            the other private threads when you want cross-thread collaboration.
          </p>
        ) : null}
      </section>
    </div>
  );
}
