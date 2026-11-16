import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

import { messageKeys, type MessageLocale } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type {
  MembershipStatus,
  PlatformLobbyCatSummary,
} from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';
import type { DirectoryRequestError } from './directoryApi.js';

type Translate = ReturnType<typeof useI18n>['t'];

export function useCatLookup(cats: readonly PlatformLobbyCatSummary[]): Map<string, PlatformLobbyCatSummary> {
  const lookup = new Map<string, PlatformLobbyCatSummary>();
  for (const cat of cats) lookup.set(cat.id, cat);
  return lookup;
}

export function DirectoryCatAvatar({
  cat,
  size = 'medium',
}: {
  cat: PlatformLobbyCatSummary;
  size?: 'small' | 'medium';
}) {
  const style = cat.avatarUrl
    ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : cat.avatarColor ? { background: cat.avatarColor } : undefined;
  return (
    <span
      className={[
        'catAvatar',
        'directoryCatAvatar',
        `directoryCatAvatar--${size}`,
        cat.isBoss ? 'catAvatarBoss' : '',
      ].filter(Boolean).join(' ')}
      style={style}
      aria-hidden="true"
    >
      {cat.avatarUrl ? null : nameInitials(cat.name)}
    </span>
  );
}

/** Groups are rounded squares, Cats are circles; green for Clowders, blue for Catteries. */
export function DirectoryGroupAvatar({
  name,
  kind,
  size = 'large',
}: {
  name: string;
  kind: 'clowder' | 'cattery';
  size?: 'small' | 'large';
}) {
  return (
    <span className={`directoryGroupAvatar directoryGroupAvatar--${kind} directoryGroupAvatar--${size}`} aria-hidden="true">
      {name.trim().slice(0, 1)}
    </span>
  );
}

export function formatDirectoryDate(iso: string, locale: MessageLocale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
}

/** `YYYY-MM-DD` for a date input, from a stored end date. */
export function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export function membershipStatusLabel(t: Translate, status: MembershipStatus): string {
  if (status === 'temp') return t(messageKeys.directoryStatusTemp);
  if (status === 'external') return t(messageKeys.directoryStatusExternal);
  return t(messageKeys.directoryStatusFormal);
}

/** A passed end date is shown, never hidden (SPEC-103 FR-23). */
export function MembershipStatusChip({
  status,
  expiresAt,
  now = new Date(),
}: {
  status: MembershipStatus;
  expiresAt?: string | null;
  now?: Date;
}) {
  const { t, locale } = useI18n();
  const ended = status === 'temp' && expiresAt ? Date.parse(expiresAt) < now.getTime() : false;
  const label = status === 'temp' && expiresAt
    ? t(ended ? messageKeys.directoryStatusTempEnded : messageKeys.directoryStatusTempUntil, {
        date: formatDirectoryDate(expiresAt, locale),
      })
    : membershipStatusLabel(t, status);
  return (
    <span className={`directoryStatusChip directoryStatusChip--${ended ? 'ended' : status}`}>{label}</span>
  );
}

export function directoryErrorMessage(t: Translate, error: DirectoryRequestError): string {
  if (error.code === 'directory_unreadable') return t(messageKeys.directoryErrorUnreadable);
  if (error.code === 'directory_newer') return t(messageKeys.directoryErrorNewer);
  if (error.code === 'directory_name_required') return t(messageKeys.directoryErrorNameRequired);
  return t(messageKeys.directoryErrorSaveFailed, { message: error.message });
}

export function DirectoryLoadError({
  error,
  onRetry,
}: {
  error: DirectoryRequestError;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const message = error.code === 'directory_unreadable' || error.code === 'directory_newer'
    ? directoryErrorMessage(t, error)
    : t(messageKeys.directoryErrorLoadFailed, { message: error.message });
  return (
    <section className="contentCard directoryLoadError" role="alert">
      <p>{message}</p>
      <button type="button" className="secondaryButton" onClick={onRetry}>
        {t(messageKeys.directoryRetryAction)}
      </button>
    </section>
  );
}

/** Closes a popover on an outside press or Escape. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    function handlePointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onCloseRef.current();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, ref]);
}

export function DirectorySegmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="directorySegmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="directorySegment"
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => { if (option.value !== value) onChange(option.value); }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
