import { useCallback, useEffect, useState } from 'react';

import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import {
  decideConversationProposal,
  fetchConversationProposal,
  type ConversationProposalCardView,
} from '../../api/proposals.js';

export interface ConversationProposalCardProps {
  readOnly?: boolean;
  channelId: string;
  proposalId: string;
  /** The status the card's message carries. Only an open card reads live details. */
  status: string;
}

/**
 * SPEC-142 FR-15, FR-16: the owner's card for a proposal. Everything shown comes from the
 * server's proposal store through an owner-only route; the model never sees any of it.
 */
export function ConversationProposalCard({ channelId, proposalId, status, readOnly = false }: ConversationProposalCardProps) {
  const { t } = useI18n();
  const [proposal, setProposal] = useState<ConversationProposalCardView | null | 'missing'>(null);
  const [answered, setAnswered] = useState<{ status: string; refusal: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const settled = answered ?? (status !== 'open' ? { status, refusal: null } : null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setProposal(await fetchConversationProposal(channelId, proposalId, signal) ?? 'missing');
    } catch {
      if (!signal?.aborted) setProposal('missing');
    }
  }, [channelId, proposalId]);

  useEffect(() => {
    if (settled || readOnly) return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, settled === null, readOnly]);

  async function answer(decision: 'confirm' | 'decline'): Promise<void> {
    if (busy || readOnly) return;
    setBusy(true);
    setFailed(false);
    try {
      setAnswered(await decideConversationProposal(channelId, proposalId, decision));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const settledLine = (value: { status: string; refusal: string | null }) => {
    switch (value.status) {
      case 'confirmed': return t(messageKeys.chatConversationProposalConfirmed);
      case 'declined': return t(messageKeys.chatConversationProposalDeclined);
      case 'expired': return t(messageKeys.chatConversationProposalExpired);
      case 'stale': return t(messageKeys.chatConversationProposalStale);
      case 'confirming': return t(messageKeys.chatConversationProposalConfirming);
      default: return t(messageKeys.chatConversationProposalFailed, { reason: value.refusal ?? '—' });
    }
  };

  if (settled) {
    return <div className="messageChoices"><p className="messageChoiceResolved">{settledLine(settled)}</p></div>;
  }
  if (readOnly) return <p className="messageChoiceResolved">{t(messageKeys.conversationRestoreToRespond)}</p>;
  if (proposal === null) return null;
  if (proposal === 'missing') {
    return <div className="messageChoices"><p className="messageChoiceResolved">{t(messageKeys.chatConversationProposalMissing)}</p></div>;
  }
  if (proposal.status !== 'open') {
    return (
      <div className="messageChoices">
        <p className="messageChoiceResolved">{settledLine({ status: proposal.status, refusal: proposal.refusal })}</p>
      </div>
    );
  }
  const view = proposal.view;
  return (
    <div className="messageChoices bossCatJoinCard conversationProposalCard">
      <section className="messageChoiceSection">
        <p className="messageChoiceQuestion">{view?.title ?? t(messageKeys.chatConversationProposalUnavailable)}</p>
        <p className="bossCatJoinCardLine">
          {proposal.proposer?.name
            ? t(messageKeys.chatConversationProposalProposer, { name: proposal.proposer.name })
            : t(messageKeys.chatConversationProposalProposerUnknown)}
        </p>
        {view && view.fields.length > 0 ? (
          <>
            <p className="bossCatJoinCardLabel">{t(messageKeys.chatConversationProposalFieldsLabel)}</p>
            <ul className="bossCatJoinCardList">
              {view.fields.map((field) => <li key={field.name}>{`${field.name}: ${field.value ?? '—'}`}</li>)}
            </ul>
          </>
        ) : null}
        {view && view.records.length > 0 ? (
          <>
            <p className="bossCatJoinCardLabel">{t(messageKeys.chatConversationProposalRecordsLabel)}</p>
            <ul className="bossCatJoinCardList">
              {view.records.map((record, index) => (
                <li key={`${record.kind}:${record.id ?? index}`}>{record.title ?? record.id ?? record.kind}</li>
              ))}
            </ul>
          </>
        ) : null}
        {view?.folderWarning ? (
          <p className="bossCatJoinCardLine conversationProposalFolderWarning" role="note">
            {t(messageKeys.chatConversationProposalFolderWarning, {
              folder: view.folderWarning.folder,
              conversations: String(view.folderWarning.otherConversations),
              workItems: String(view.folderWarning.workItems),
            })}
          </p>
        ) : null}
        {proposal.outOfDate ? (
          <p className="bossCatJoinCardLine">{t(messageKeys.chatConversationProposalOutOfDate)}</p>
        ) : null}
        <p className="bossCatJoinCardLine">
          {t(messageKeys.chatConversationProposalExpires, { time: new Date(proposal.expiresAt).toLocaleString() })}
        </p>
      </section>
      <div className="messageChoiceActions">
        <button
          type="button"
          className="messageChoiceActionButton messageChoiceActionButtonPrimary"
          disabled={busy || !view}
          onClick={() => { void answer('confirm'); }}
        >
          {t(messageKeys.chatConversationProposalConfirm)}
        </button>
        <button
          type="button"
          className="messageChoiceActionButton"
          disabled={busy}
          onClick={() => { void answer('decline'); }}
        >
          {t(messageKeys.chatConversationProposalDecline)}
        </button>
      </div>
      {failed ? <p className="messageChoiceResolved">{t(messageKeys.chatConversationProposalDecisionFailure)}</p> : null}
    </div>
  );
}
