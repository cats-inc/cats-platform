import type { CSSProperties } from 'react';

import { catInitials } from '../chatUtils.js';

export interface ComposerStackParticipant {
  participantId: string;
  label: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  isBoss: boolean;
  useNeutralAvatar: boolean;
}

export interface ComposerParticipantStackProps {
  participants: ComposerStackParticipant[];
  defaultParticipantId: string | null;
  onClick?: () => void;
}

export function ComposerParticipantStack({
  participants,
  defaultParticipantId,
  onClick,
}: ComposerParticipantStackProps) {
  if (participants.length === 0) return null;

  const lead = defaultParticipantId
    ? participants.find((participant) => participant.participantId === defaultParticipantId)
    : participants[0];
  const others = participants.filter((participant) => participant.participantId !== lead?.participantId);
  const ordered = lead ? [lead, ...others] : participants;
  const rendered = [...ordered].reverse();

  return (
    <div
      className="composerCatStack"
      style={{ marginRight: 10 }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {rendered.map((participant, index) => {
        const style: CSSProperties = participant.avatarUrl
          ? {
              backgroundImage: `url(${participant.avatarUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              zIndex: index + 1,
            }
          : participant.useNeutralAvatar
            ? { zIndex: index + 1 }
            : {
                background: participant.avatarColor ?? '#8B7E74',
                color: '#fff',
                zIndex: index + 1,
              };

        return (
          <div
            key={participant.participantId}
            className={[
              'catAvatar',
              'composerStackAvatar',
              participant.isBoss ? 'catAvatarBoss' : '',
              participant.useNeutralAvatar ? 'channelParticipantAvatar' : '',
            ].filter(Boolean).join(' ')}
            data-tooltip={participant.label}
            style={style}
          >
            {participant.avatarUrl ? null : catInitials(participant.label)}
          </div>
        );
      })}
    </div>
  );
}
