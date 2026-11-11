import { useCallback, useEffect, useState } from 'react';

import { messageKeys, type MessageKey } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import {
  decideBossCatJoinRequest,
  fetchBossCatJoinRequest,
  type BossCatJoinRequestView,
} from '../../api/bossCat.js';

const REFUSAL_LABELS: Record<string, MessageKey> = {
  policy_changed: messageKeys.chatBossCatCardRefusedPolicyChanged,
  card_stale: messageKeys.chatBossCatCardRefusedStale,
  not_permitted: messageKeys.chatBossCatCardRefusedNotPermitted,
  conversation_archived: messageKeys.chatBossCatCardRefusedArchived,
  conversation_not_joinable: messageKeys.chatBossCatCardRefusedNotJoinable,
  already_member: messageKeys.chatBossCatCardRefusedAlreadyMember,
  participant_limit: messageKeys.chatBossCatCardRefusedParticipantLimit,
};

export interface BossCatJoinRequestCardProps {
  laneId: string;
  requestId: string;
  /** The status the transcript carries; the card re-reads live details when it changes. */
  status: string;
}

/**
 * SPEC-139 FR-10: the owner's join card. Everything shown comes from live state through an
 * owner-only route; the model never sees any of it.
 */
export function BossCatJoinRequestCard({ laneId, requestId, status }: BossCatJoinRequestCardProps) {
  const { t } = useI18n();
  const [request, setRequest] = useState<BossCatJoinRequestView | null | 'missing'>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setRequest(await fetchBossCatJoinRequest(laneId, requestId, signal) ?? 'missing');
    } catch {
      if (!signal?.aborted) setRequest('missing');
    }
  }, [laneId, requestId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, status]);

  async function answer(decision: 'approve' | 'decline'): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      await decideBossCatJoinRequest(laneId, requestId, decision);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      await load();
    }
  }

  if (request === null) return null;
  if (request === 'missing') {
    return <div className="messageChoices"><p className="messageChoiceResolved">{t(messageKeys.chatBossCatCardMissing)}</p></div>;
  }

  const conversation = request.conversation;
  const grants = request.grants;
  const boss = request.bossCat;
  const statusLine = request.status === 'approved' ? t(messageKeys.chatBossCatCardApproved)
    : request.status === 'declined' ? t(messageKeys.chatBossCatCardDeclined)
      : request.status === 'expired' ? t(messageKeys.chatBossCatCardExpired)
        : request.status === 'refused'
          ? t(messageKeys.chatBossCatCardRefused, {
              reason: t(REFUSAL_LABELS[request.refusal ?? ''] ?? messageKeys.chatBossCatCardRefusedNotJoinable),
            })
          : null;

  return (
    <div className="messageChoices bossCatJoinCard">
      <section className="messageChoiceSection">
        <p className="messageChoiceQuestion">
          {conversation
            ? t(messageKeys.chatBossCatCardTitle, { name: boss?.name ?? '', title: conversation.title })
            : t(messageKeys.chatBossCatCardMissing)}
        </p>
        {conversation ? (
          <p className="bossCatJoinCardLine">
            {t(messageKeys.chatBossCatCardConversation, {
              surface: conversation.surface,
              participants: conversation.participantNames.join(', '),
            })}
          </p>
        ) : null}
        {grants ? (
          <>
            <p className="bossCatJoinCardLabel">{t(messageKeys.chatBossCatCardGrantsLabel)}</p>
            <ul className="bossCatJoinCardList">
              <li>{grants.repoPath
                ? t(messageKeys.chatBossCatCardFolder, { path: grants.repoPath })
                : t(messageKeys.chatBossCatCardNoFolder)}</li>
              <li>{t(messageKeys.chatBossCatCardAccess, {
                access: grants.workspaceAccess === 'read_only'
                  ? t(messageKeys.chatBossCatCardReadOnly)
                  : t(messageKeys.chatBossCatCardReadWrite),
                mode: grants.permissionMode,
              })}</li>
              {grants.codeTools ? <li>{t(messageKeys.chatBossCatCardCodeTools)}</li> : null}
            </ul>
          </>
        ) : null}
        {boss ? (
          <>
            <p className="bossCatJoinCardLabel">{t(messageKeys.chatBossCatCardBringsLabel)}</p>
            <ul className="bossCatJoinCardList">
              <li>{boss.model ? `${boss.provider} · ${boss.model}` : boss.provider}</li>
              <li>{t(messageKeys.chatBossCatCardProfiles, {
                mcp: boss.mcpProfile ?? '—',
                skill: boss.skillProfile ?? '—',
              })}</li>
              <li>{boss.companionMemory
                ? t(messageKeys.chatBossCatCardCompanionMemory)
                : t(messageKeys.chatBossCatCardNoCompanionMemory)}</li>
            </ul>
          </>
        ) : null}
        <p className="bossCatJoinCardLine">
          {t(messageKeys.chatBossCatCardHistory, { count: String(request.history.messagesBeforeJoin) })}
        </p>
        <p className="bossCatJoinCardLine">
          {t(messageKeys.chatBossCatCardRequested, {
            via: request.requestedVia === 'mobile'
              ? t(messageKeys.chatBossCatCardViaMobile)
              : t(messageKeys.chatBossCatCardViaDesktop),
            expires: new Date(request.expiresAt).toLocaleString(),
          })}
        </p>
      </section>
      {statusLine ? <p className="messageChoiceResolved">{statusLine}</p> : null}
      {request.status === 'pending' ? (
        <div className="messageChoiceActions">
          <button
            type="button"
            className="messageChoiceActionButton messageChoiceActionButtonPrimary"
            disabled={busy}
            onClick={() => { void answer('approve'); }}
          >
            {t(messageKeys.chatBossCatCardApprove)}
          </button>
          <button
            type="button"
            className="messageChoiceActionButton"
            disabled={busy}
            onClick={() => { void answer('decline'); }}
          >
            {t(messageKeys.chatBossCatCardDecline)}
          </button>
        </div>
      ) : null}
      {failed ? <p className="messageChoiceResolved">{t(messageKeys.chatBossCatCardDecisionFailure)}</p> : null}
    </div>
  );
}
