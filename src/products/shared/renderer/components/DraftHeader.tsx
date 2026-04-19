import type { CSSProperties, ReactNode } from 'react';

import { nameInitials } from '../../../../shared/nameInitials.js';

export type DraftHeaderVariant = 'intro' | 'profile';

export interface DraftHeaderProps {
  variant?: DraftHeaderVariant;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  supportingContent?: ReactNode;
  actions?: ReactNode;
  avatarName?: string | null;
  avatarUrl?: string | null;
  avatarColor?: string | null;
}

function buildAvatarStyle(input: {
  avatarUrl?: string | null;
  avatarColor?: string | null;
}): CSSProperties | undefined {
  if (input.avatarUrl) {
    return {
      backgroundImage: `url(${input.avatarUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (input.avatarColor) {
    return { background: input.avatarColor };
  }
  return undefined;
}

export function DraftHeader({
  variant = 'intro',
  eyebrow,
  title,
  description,
  supportingContent,
  actions,
  avatarName,
  avatarUrl,
  avatarColor,
}: DraftHeaderProps) {
  const hasAvatar = variant === 'profile' && Boolean(avatarName);

  return (
    <div className={`draftHeader draftHeader${variant === 'profile' ? 'Profile' : 'Intro'}`}>
      {hasAvatar ? (
        <div className="draftHeaderVisual">
          <div
            className="draftHeaderAvatar"
            style={buildAvatarStyle({ avatarUrl, avatarColor })}
            aria-hidden="true"
          >
            {avatarUrl ? null : nameInitials(avatarName ?? '')}
          </div>
        </div>
      ) : null}
      <div className="draftHeaderBody">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <div className="draftHeaderTitleRow">
          <h1 className="draftHeaderTitle">{title}</h1>
          {actions ? <div className="draftHeaderActions">{actions}</div> : null}
        </div>
        {description ? <p className="heroNote">{description}</p> : null}
        {supportingContent ? (
          <div className="draftHeaderSupportingContent">{supportingContent}</div>
        ) : null}
      </div>
    </div>
  );
}
