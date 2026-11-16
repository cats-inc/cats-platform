import { isMembershipEnded } from '../shared/directoryMembership.js';
import { createTranslator, messageKeys, type MessageLocale } from '../shared/i18n/index.js';
import type {
  MobileChatCat,
  MobileDirectoryView,
  MobileMembershipStatus,
} from './contracts.js';

/**
 * What the mobile Clowder and Cattery screens show (SPEC-103), projected
 * from `/api/platform/directory` and the app shell's Cats. Wording comes
 * from the Desktop catalogs, so both clients say the same thing.
 */

type Translate = ReturnType<typeof createTranslator>;

/**
 * An end date as Desktop shows it (`toLocaleDateString`, numeric, UTC),
 * written out so it does not depend on the phone's Intl support.
 */
export function formatMobileDirectoryDate(iso: string, locale: MessageLocale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return locale === 'zh-TW' ? `${year}/${month}/${day}` : `${month}/${day}/${year}`;
}

export interface MobileDirectoryMemberRow {
  catId: string;
  name: string;
  avatarColor: string | null;
  role: string;
  status: MobileMembershipStatus;
  /** Null for a formal member, which shows no status. */
  statusLabel: string | null;
  /** A temporary member whose end date has passed; still listed (FR-23). */
  ended: boolean;
}

export interface MobileClowderDetail {
  kind: 'clowder';
  id: string;
  name: string;
  description: string | null;
  cattery: { id: string; name: string } | null;
  /** "Part of …" or "Cross-unit task force", as on the Desktop home. */
  subtitle: string;
  members: MobileDirectoryMemberRow[];
}

export interface MobileCatteryClowderRow {
  id: string;
  name: string;
  /** Its Cat count. */
  detail: string;
}

export interface MobileCatteryDetail {
  kind: 'cattery';
  id: string;
  name: string;
  description: string | null;
  domain: string | null;
  /** Direct members only; a Clowder's members are listed on the Clowder. */
  members: MobileDirectoryMemberRow[];
  clowders: MobileCatteryClowderRow[];
}

function activeCatLookup(cats: readonly MobileChatCat[]): Map<string, MobileChatCat> {
  return new Map(cats.filter((cat) => cat.status === 'active').map((cat) => [cat.id, cat]));
}

function statusOf(
  t: Translate,
  locale: MessageLocale,
  status: MobileMembershipStatus,
  expiresAt: string | null,
  now: Date,
): { statusLabel: string | null; ended: boolean } {
  const ended = isMembershipEnded(status, expiresAt, now);
  if (status === 'formal') return { statusLabel: null, ended };
  if (status === 'temp' && expiresAt) {
    return {
      statusLabel: t(ended ? messageKeys.directoryStatusTempEnded : messageKeys.directoryStatusTempUntil, {
        date: formatMobileDirectoryDate(expiresAt, locale),
      }),
      ended,
    };
  }
  return {
    statusLabel: t(status === 'temp' ? messageKeys.directoryStatusTemp : messageKeys.directoryStatusExternal),
    ended,
  };
}

export function selectMobileClowderDetail(
  directory: MobileDirectoryView,
  cats: readonly MobileChatCat[],
  clowderId: string,
  locale: MessageLocale,
  now: Date = new Date(),
): MobileClowderDetail | null {
  const clowder = directory.clowders.find((candidate) => candidate.id === clowderId);
  if (!clowder) return null;
  const t = createTranslator(locale);
  const lookup = activeCatLookup(cats);
  const cattery = clowder.parentCatteryId
    ? directory.catteries.find((candidate) => candidate.id === clowder.parentCatteryId) ?? null
    : null;
  return {
    kind: 'clowder',
    id: clowder.id,
    name: clowder.name,
    description: clowder.description,
    cattery: cattery ? { id: cattery.id, name: cattery.name } : null,
    subtitle: cattery
      ? t(messageKeys.clowderHomeChipPartOf, { catteryName: cattery.name })
      : t(messageKeys.clowderHomeChipCrossUnit),
    members: clowder.members.flatMap((member) => {
      const cat = lookup.get(member.catId);
      if (!cat) return [];
      return [{
        catId: member.catId,
        name: cat.name,
        avatarColor: cat.avatarColor,
        role: t(member.role === 'lead' ? messageKeys.directoryRoleLead : messageKeys.directoryRoleMember),
        status: member.status,
        ...statusOf(t, locale, member.status, member.expiresAt, now),
      }];
    }),
  };
}

export function selectMobileCatteryDetail(
  directory: MobileDirectoryView,
  cats: readonly MobileChatCat[],
  catteryId: string,
  locale: MessageLocale,
  now: Date = new Date(),
): MobileCatteryDetail | null {
  const cattery = directory.catteries.find((candidate) => candidate.id === catteryId);
  if (!cattery) return null;
  const t = createTranslator(locale);
  const lookup = activeCatLookup(cats);
  return {
    kind: 'cattery',
    id: cattery.id,
    name: cattery.name,
    description: cattery.description,
    domain: cattery.domain,
    members: cattery.members.flatMap((member) => {
      const cat = lookup.get(member.catId);
      if (!cat) return [];
      return [{
        catId: member.catId,
        name: cat.name,
        avatarColor: cat.avatarColor,
        role: t(member.role === 'owner'
          ? messageKeys.directoryRoleOwner
          : member.role === 'admin' ? messageKeys.directoryRoleAdmin : messageKeys.directoryRoleMember),
        status: member.status,
        ...statusOf(t, locale, member.status, null, now),
      }];
    }),
    clowders: directory.clowders
      .filter((clowder) => clowder.parentCatteryId === cattery.id)
      .map((clowder) => ({
        id: clowder.id,
        name: clowder.name,
        detail: t(messageKeys.clowdersCanvasMoveMemberCount, {
          count: String(clowder.members.filter((member) => lookup.has(member.catId)).length),
        }),
      })),
  };
}

/** The error a Directory request answered with, as `{ error: { code, message } }`. */
export function readMobileDirectoryErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Why the Directory could not be read: a refused file says so, anything else gives the error. */
export function mobileDirectoryLoadErrorMessage(
  locale: MessageLocale,
  body: unknown,
  message: string,
): string {
  const t = createTranslator(locale);
  const code = readMobileDirectoryErrorCode(body);
  if (code === 'directory_unreadable') return t(messageKeys.directoryErrorUnreadable);
  if (code === 'directory_newer') return t(messageKeys.directoryErrorNewer);
  return t(messageKeys.directoryErrorLoadFailed, { message });
}

export interface MobileDirectoryCopy {
  clowderTitle: string;
  catteryTitle: string;
  membersHeading: string;
  clowdersHeading: string;
  clowderEmptyMembers: string;
  catteryEmptyMembers: string;
  catteryEmptyClowders: string;
  clowderNotFoundTitle: string;
  catteryNotFoundTitle: string;
  retryAction: string;
}

export function getMobileDirectoryCopy(locale: MessageLocale): MobileDirectoryCopy {
  const t = createTranslator(locale);
  return {
    clowderTitle: t(messageKeys.clowdersListEyebrow),
    catteryTitle: t(messageKeys.catteriesListEyebrow),
    membersHeading: t(messageKeys.directoryMembersHeading),
    clowdersHeading: t(messageKeys.catteryHomeTabClowders),
    clowderEmptyMembers: t(messageKeys.clowderHomeEmptyCats),
    catteryEmptyMembers: t(messageKeys.catteryHomeEmptyMembers),
    catteryEmptyClowders: t(messageKeys.catteryHomeEmptyClowders),
    clowderNotFoundTitle: t(messageKeys.clowderHomeNotFoundTitle),
    catteryNotFoundTitle: t(messageKeys.catteryHomeNotFoundTitle),
    retryAction: t(messageKeys.directoryRetryAction),
  };
}
