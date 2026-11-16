import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { messageKeys, type MessageLocale } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type {
  MembershipStatus,
  PlatformDirectoryView,
  PlatformLobbyCatSummary,
} from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';
import type { DirectoryRequestError, useDirectory } from './directoryApi.js';

type Translate = ReturnType<typeof useI18n>['t'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a Directory canvas hands its parts: run a change, report it, report a failure. */
export interface DirectoryCanvasActions {
  run: ReturnType<typeof useDirectory>['run'];
  toast: (message: string) => void;
  fail: (error: DirectoryRequestError) => void;
  pending: boolean;
}

/** Clowders under each Cattery in creation order, then the ones without a Cattery. */
export function groupClowders(directory: PlatformDirectoryView, crossUnitLabel: string) {
  const groups = directory.catteries
    .map((cattery) => ({
      key: cattery.id,
      label: cattery.name,
      clowders: directory.clowders.filter((clowder) => clowder.parentCatteryId === cattery.id),
    }))
    .filter((group) => group.clowders.length > 0);
  const loose = directory.clowders.filter((clowder) => clowder.parentCatteryId === null);
  if (loose.length > 0) groups.push({ key: 'none', label: crossUnitLabel, clowders: loose });
  return groups;
}

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
  compact = false,
  now = new Date(),
}: {
  status: MembershipStatus;
  expiresAt?: string | null;
  /** Just the status, with the end date in the tooltip, for narrow org-chart cards. */
  compact?: boolean;
  now?: Date;
}) {
  const { t, locale } = useI18n();
  // The end date is a whole day: a Cat temporary until 12/31 is still a member on 12/31.
  const ended = status === 'temp' && expiresAt ? Date.parse(expiresAt) + DAY_MS <= now.getTime() : false;
  const label = status === 'temp' && expiresAt
    ? t(ended ? messageKeys.directoryStatusTempEnded : messageKeys.directoryStatusTempUntil, {
        date: formatDirectoryDate(expiresAt, locale),
      })
    : membershipStatusLabel(t, status);
  return (
    <span
      className={`directoryStatusChip directoryStatusChip--${ended ? 'ended' : status}`}
      title={compact && label !== membershipStatusLabel(t, status) ? label : undefined}
    >
      {compact ? membershipStatusLabel(t, status) : label}
    </span>
  );
}

export function directoryErrorMessage(t: Translate, error: DirectoryRequestError): string {
  if (error.code === 'directory_unreadable') return t(messageKeys.directoryErrorUnreadable);
  if (error.code === 'directory_newer') return t(messageKeys.directoryErrorNewer);
  if (error.code === 'directory_name_required') return t(messageKeys.directoryErrorNameRequired);
  if (error.code === 'cattery_domain_invalid') return t(messageKeys.directoryErrorDomainInvalid);
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

/** "Add a cat": the Cats not yet in the group, each added with one click. */
export function AddCatPopover({
  memberIds,
  cats,
  pending,
  onAdd,
}: {
  memberIds: ReadonlySet<string>;
  cats: readonly PlatformLobbyCatSummary[];
  pending: boolean;
  onAdd: (cat: PlatformLobbyCatSummary) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const candidates = cats.filter((cat) => !memberIds.has(cat.id));

  return (
    <div className="directoryPopoverAnchor" ref={ref}>
      <button
        type="button"
        className="secondaryButton directorySmallButton"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
      >
        {t(messageKeys.directoryAddCatAction)}
      </button>
      {open ? (
        <div className="accountMenu accountMenu--below accountMenu--alignEnd directoryMenu" role="menu">
          <p className="directoryMenuCaption">{t(messageKeys.directoryAddCatHint)}</p>
          {cats.length === 0 ? <p className="directoryMenuEmpty">{t(messageKeys.directoryNoCats)}</p> : null}
          {cats.length > 0 && candidates.length === 0 ? (
            <p className="directoryMenuEmpty">{t(messageKeys.directoryAddCatNone)}</p>
          ) : null}
          {candidates.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="menuitem"
              className="accountMenuItem directoryMenuItem"
              onClick={() => { setOpen(false); onAdd(cat); }}
            >
              <DirectoryCatAvatar cat={cat} size="small" />
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A temporary member's end date. Typing changes only a draft: a date input
 * reports each partial entry, so saving on every change would send the wrong
 * day. It saves on blur or Enter, and an incomplete date is dropped.
 *
 * The field lives in a menu that an outside press or Escape closes. That can
 * unmount it before it ever blurs, as when a date is picked from the calendar
 * and the owner clicks away, so a changed date is also saved on unmount.
 */
export function EndDateField({ value, onCommit }: { value: string | null; onCommit: (next: string | null) => void }) {
  const { t } = useI18n();
  const stored = toDateInputValue(value);
  const [draft, setDraft] = useState(stored);
  const latest = useRef({ draft: stored, stored, incomplete: false, sent: null as string | null, onCommit });
  latest.current = { ...latest.current, draft, stored, onCommit };
  useEffect(() => { setDraft(stored); }, [stored]);

  function send(next: string) {
    if (next === latest.current.stored || next === latest.current.sent) return;
    latest.current.sent = next;
    latest.current.onCommit(next || null);
  }

  function commit(input: HTMLInputElement) {
    if (input.validity.badInput) {
      setDraft(stored);
      return;
    }
    send(draft);
  }

  useEffect(() => () => {
    if (!latest.current.incomplete) send(latest.current.draft);
  }, []);

  return (
    <label className="directoryMenuDate">
      <span>{t(messageKeys.directoryMemberEndDate)}</span>
      <input
        type="date"
        value={draft}
        onChange={(event) => {
          latest.current.incomplete = event.target.validity.badInput;
          setDraft(event.target.value);
        }}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(event.currentTarget);
          }
        }}
      />
    </label>
  );
}
