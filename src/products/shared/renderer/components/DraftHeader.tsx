import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { nameInitials } from '../../../../shared/nameInitials.js';
import {
  MAX_COVER_BYTES,
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
  coverStorageKey,
}: DraftHeaderProps) {
  const hasAvatar = variant === 'profile' && Boolean(avatarName);
  const hasCover = variant === 'profile' && Boolean(coverStorageKey);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCover || !coverStorageKey) {
      setCoverUrl(null);
      return;
    }
    setCoverUrl(readCatCover(coverStorageKey));
    return subscribeCatCover(coverStorageKey, setCoverUrl);
  }, [coverStorageKey, hasCover]);

  function handleCoverPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file || !coverStorageKey) return;
    if (!file.type.startsWith('image/')) {
      setCoverError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setCoverError('Image must be under 4MB.');
      return;
    }
    setCoverError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) return;
      writeCatCover(coverStorageKey, result);
    };
    reader.onerror = () => {
      setCoverError('Could not read the selected image.');
    };
    reader.readAsDataURL(file);
  }

  const coverStyle: CSSProperties | undefined = coverUrl
    ? { backgroundImage: `url(${coverUrl})` }
    : undefined;

  const headerClassName = [
    'draftHeader',
    variant === 'profile' ? 'draftHeaderProfile' : 'draftHeaderIntro',
    hasCover ? 'draftHeaderWithCover' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={headerClassName}>
      {hasCover ? (
        <div
          className={`draftHeaderCover${coverUrl ? ' draftHeaderCoverLoaded' : ''}`}
          style={coverStyle}
        >
          {!coverUrl ? (
            <div className="draftHeaderCoverActions">
              <button
                type="button"
                className="draftHeaderCoverButton"
                onClick={() => fileInputRef.current?.click()}
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
                  aria-hidden="true"
                >
                  <path d="M5 3.5l1-1h4l1 1h2a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1h2z" />
                  <circle cx="8" cy="8.5" r="2.5" />
                </svg>
                <span>Add cover photo</span>
              </button>
            </div>
          ) : null}
          {coverError ? (
            <div className="draftHeaderCoverError" role="alert">{coverError}</div>
          ) : null}
          {!coverUrl ? (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleCoverPick}
            />
          ) : null}
        </div>
      ) : null}
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
