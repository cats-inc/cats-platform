import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { AvatarCropDialog } from '../../../../design/components/AvatarCropDialog.js';
import { CoverCropDialog } from '../../../../design/components/CoverCropDialog.js';
import { nameInitials } from '../../../../shared/nameInitials.js';
import {
  readCatCover,
  subscribeCatCover,
  writeCatCover,
} from '../catCoverStorage.js';

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
  coverStorageKey?: string | null;
  onAvatarSave?: (dataUrl: string) => void;
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

function CameraIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
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
  coverStorageKey,
  onAvatarSave,
}: DraftHeaderProps) {
  const hasAvatar = variant === 'profile' && Boolean(avatarName);
  const hasCover = variant === 'profile' && Boolean(coverStorageKey);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);

  useEffect(() => {
    if (!hasCover || !coverStorageKey) {
      setCoverUrl(null);
      return;
    }
    setCoverUrl(readCatCover(coverStorageKey));
    return subscribeCatCover(coverStorageKey, setCoverUrl);
  }, [coverStorageKey, hasCover]);

  function handleCoverSave(dataUrl: string) {
    setCoverDialogOpen(false);
    if (!coverStorageKey) return;
    writeCatCover(coverStorageKey, dataUrl);
  }

  function handleAvatarSave(dataUrl: string) {
    setAvatarDialogOpen(false);
    onAvatarSave?.(dataUrl);
  }

  const coverStyle: CSSProperties | undefined = (() => {
    const style: CSSProperties = {};
    if (coverUrl) {
      style.backgroundImage = `url(${coverUrl})`;
    }
    if (avatarColor) {
      (style as Record<string, string>)['--cat-avatar-color'] = avatarColor;
    }
    return Object.keys(style).length > 0 ? style : undefined;
  })();

  const headerClassName = [
    'draftHeader',
    variant === 'profile' ? 'draftHeaderProfile' : 'draftHeaderIntro',
    hasCover ? 'draftHeaderWithCover' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const avatarIsEditable = hasAvatar && !avatarUrl && typeof onAvatarSave === 'function';
  const coverIsEditable = hasCover && !coverUrl;

  return (
    <div className={headerClassName}>
      {hasCover ? (
        <div
          className={`draftHeaderCover${coverUrl ? ' draftHeaderCoverLoaded' : ''}`}
          style={coverStyle}
        >
          {coverIsEditable ? (
            <button
              type="button"
              className="draftHeaderCoverAddButton"
              onClick={() => setCoverDialogOpen(true)}
              aria-label="Add cover photo"
            >
              <CameraIcon />
              <span>Add cover photo</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {hasAvatar ? (
        <div className="draftHeaderVisual">
          {avatarIsEditable ? (
            <button
              type="button"
              className="draftHeaderAvatar draftHeaderAvatarEditable"
              style={buildAvatarStyle({ avatarUrl, avatarColor })}
              onClick={() => setAvatarDialogOpen(true)}
              aria-label="Add avatar"
            >
              <span className="draftHeaderAvatarInitials" aria-hidden="true">
                {nameInitials(avatarName ?? '')}
              </span>
              <span className="draftHeaderAvatarCameraBadge" aria-hidden="true">
                <CameraIcon />
              </span>
            </button>
          ) : (
            <div
              className="draftHeaderAvatar"
              style={buildAvatarStyle({ avatarUrl, avatarColor })}
              aria-hidden="true"
            >
              {avatarUrl ? null : nameInitials(avatarName ?? '')}
            </div>
          )}
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
      {coverDialogOpen ? (
        <CoverCropDialog
          onSave={handleCoverSave}
          onClose={() => setCoverDialogOpen(false)}
        />
      ) : null}
      {avatarDialogOpen ? (
        <AvatarCropDialog
          onSave={handleAvatarSave}
          onClose={() => setAvatarDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
