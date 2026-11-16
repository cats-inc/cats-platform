import { createTranslator, messageKeys, type MessageLocale } from '../shared/i18n/index.js';
import type {
  MobileChatCat,
  MobileCatteryMemberView,
  MobileClowderMemberView,
  MobileDirectoryView,
} from './contracts.js';
import { readMobileDirectoryErrorCode } from './directory.js';

/**
 * Changing Clowders and Catteries from the phone (SPEC-103): the requests
 * Desktop sends, and the rules its canvases apply. Every request answers
 * with the whole Directory (`MobileDirectoryResponse`).
 */

export type MobileDirectoryKind = 'clowder' | 'cattery';

export interface MobileDirectoryRequest {
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
}

export interface MobileClowderMemberPatch {
  role?: MobileClowderMemberView['role'];
  status?: MobileClowderMemberView['status'];
  /** `YYYY-MM-DD`, as Desktop's date field sends it, or null for none. */
  expiresAt?: string | null;
}

export interface MobileCatteryMemberPatch {
  role?: MobileCatteryMemberView['role'];
  status?: MobileCatteryMemberView['status'];
}

const groupPath = (kind: MobileDirectoryKind, id: string) =>
  `/api/platform/${kind === 'clowder' ? 'clowders' : 'catteries'}/${encodeURIComponent(id)}`;
const memberPath = (kind: MobileDirectoryKind, id: string, catId: string) =>
  `${groupPath(kind, id)}/members/${encodeURIComponent(catId)}`;

export const mobileDirectoryRequests = {
  createClowder: (input: { name: string; description: string | null; parentCatteryId: string | null }): MobileDirectoryRequest =>
    ({ method: 'POST', path: '/api/platform/clowders', body: input }),
  createCattery: (input: { name: string; description: string | null; domain: string | null }): MobileDirectoryRequest =>
    ({ method: 'POST', path: '/api/platform/catteries', body: input }),
  updateGroup: (
    kind: MobileDirectoryKind,
    id: string,
    patch: { name?: string; description?: string | null; domain?: string | null },
  ): MobileDirectoryRequest => ({ method: 'PATCH', path: groupPath(kind, id), body: patch }),
  deleteGroup: (kind: MobileDirectoryKind, id: string): MobileDirectoryRequest =>
    ({ method: 'DELETE', path: groupPath(kind, id) }),
  /** A new member joins as a formal member, as on Desktop. */
  addMember: (kind: MobileDirectoryKind, id: string, catId: string): MobileDirectoryRequest =>
    ({ method: 'POST', path: `${groupPath(kind, id)}/members`, body: { catId } }),
  updateClowderMember: (id: string, catId: string, patch: MobileClowderMemberPatch): MobileDirectoryRequest =>
    ({ method: 'PATCH', path: memberPath('clowder', id, catId), body: patch }),
  updateCatteryMember: (id: string, catId: string, patch: MobileCatteryMemberPatch): MobileDirectoryRequest =>
    ({ method: 'PATCH', path: memberPath('cattery', id, catId), body: patch }),
  removeMember: (kind: MobileDirectoryKind, id: string, catId: string): MobileDirectoryRequest =>
    ({ method: 'DELETE', path: memberPath(kind, id, catId) }),
  /** One operation: leaves the source and joins the target, keeping its status (FR-25). */
  moveClowderMember: (id: string, catId: string, toClowderId: string): MobileDirectoryRequest =>
    ({ method: 'POST', path: `${memberPath('clowder', id, catId)}/move`, body: { toClowderId } }),
} as const;

export type MobileEndDateInput = { ok: true; value: string | null } | { ok: false };

/**
 * A typed end date. The phone has no date picker without a native module,
 * so the owner types `YYYY-MM-DD`; empty means no end date. A date that
 * does not exist on the calendar is refused.
 */
export function parseMobileEndDate(text: string): MobileEndDateInput {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return { ok: false };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false };
  }
  return { ok: true, value: trimmed };
}

/** A stored end date as the field shows it. */
export function toMobileEndDateText(expiresAt: string | null): string {
  return expiresAt ? expiresAt.slice(0, 10) : '';
}

export interface MobileAddableCat {
  id: string;
  name: string;
  avatarColor: string | null;
}

/** Active Cats not yet in the group, in the app shell's order. */
export function selectMobileAddableCats(
  directory: MobileDirectoryView,
  cats: readonly MobileChatCat[],
  kind: MobileDirectoryKind,
  groupId: string,
): MobileAddableCat[] {
  const group = kind === 'clowder'
    ? directory.clowders.find((candidate) => candidate.id === groupId)
    : directory.catteries.find((candidate) => candidate.id === groupId);
  const inGroup = new Set((group?.members ?? []).map((member) => member.catId));
  return cats
    .filter((cat) => cat.status === 'active' && !inGroup.has(cat.id))
    .map((cat) => ({ id: cat.id, name: cat.name, avatarColor: cat.avatarColor }));
}

export interface MobileMoveTarget {
  id: string;
  name: string;
  detail: string;
  /** The Cat is already in it: moving there only leaves the source, and adding does nothing. */
  alreadyIn: boolean;
}

export interface MobileMoveTargetGroup {
  key: string;
  label: string;
  targets: MobileMoveTarget[];
}

/**
 * The Clowders a member can move to or also join, under their Cattery in
 * Directory order and then the ones without one, as Desktop's move dialog
 * lists them. The source is left out.
 */
export function selectMobileMoveTargets(
  directory: MobileDirectoryView,
  cats: readonly MobileChatCat[],
  sourceClowderId: string,
  catId: string,
  locale: MessageLocale,
): MobileMoveTargetGroup[] {
  const t = createTranslator(locale);
  const active = new Set(cats.filter((cat) => cat.status === 'active').map((cat) => cat.id));
  const toTarget = (clowder: MobileDirectoryView['clowders'][number]): MobileMoveTarget => ({
    id: clowder.id,
    name: clowder.name,
    detail: t(messageKeys.clowdersCanvasMoveMemberCount, {
      count: String(clowder.members.filter((member) => active.has(member.catId)).length),
    }),
    alreadyIn: clowder.members.some((member) => member.catId === catId),
  });
  const others = directory.clowders.filter((clowder) => clowder.id !== sourceClowderId);
  const groups: MobileMoveTargetGroup[] = directory.catteries
    .map((cattery) => ({
      key: cattery.id,
      label: cattery.name,
      targets: others.filter((clowder) => clowder.parentCatteryId === cattery.id).map(toTarget),
    }))
    .filter((group) => group.targets.length > 0);
  const loose = others.filter((clowder) => clowder.parentCatteryId === null).map(toTarget);
  if (loose.length > 0) groups.push({ key: 'none', label: t(messageKeys.clowderHomeChipCrossUnit), targets: loose });
  return groups;
}

/** What deleting a group leaves behind, in Desktop's words: its Cats always stay (FR-24). */
export function mobileDeleteGroupConfirmCopy(
  directory: MobileDirectoryView,
  cats: readonly MobileChatCat[],
  kind: MobileDirectoryKind,
  groupId: string,
  locale: MessageLocale,
): { title: string; message: string; confirm: string } | null {
  const t = createTranslator(locale);
  const active = new Set(cats.filter((cat) => cat.status === 'active').map((cat) => cat.id));
  if (kind === 'clowder') {
    const clowder = directory.clowders.find((candidate) => candidate.id === groupId);
    if (!clowder) return null;
    const count = clowder.members.filter((member) => active.has(member.catId)).length;
    return {
      title: t(messageKeys.clowdersCanvasDeleteTitle, { name: clowder.name }),
      message: count > 0
        ? t(messageKeys.clowdersCanvasDeleteMessage, { count: String(count) })
        : t(messageKeys.clowdersCanvasDeleteMessageEmpty),
      confirm: t(messageKeys.clowdersCanvasDeleteConfirm),
    };
  }
  const cattery = directory.catteries.find((candidate) => candidate.id === groupId);
  if (!cattery) return null;
  const clowders = directory.clowders.filter((clowder) => clowder.parentCatteryId === cattery.id);
  const catIds = new Set([
    ...cattery.members.map((member) => member.catId),
    ...clowders.flatMap((clowder) => clowder.members.map((member) => member.catId)),
  ].filter((id) => active.has(id)));
  return {
    title: t(messageKeys.catteriesCanvasDeleteTitle, { name: cattery.name }),
    message: clowders.length > 0
      ? t(messageKeys.catteriesCanvasDeleteMessage, { cats: String(catIds.size), clowders: String(clowders.length), name: cattery.name })
      : t(messageKeys.catteriesCanvasDeleteMessageNoClowders, { cats: String(catIds.size), name: cattery.name }),
    confirm: t(messageKeys.catteriesCanvasDeleteConfirm),
  };
}

const GONE_CODES = new Set(['clowder_not_found', 'cattery_not_found', 'membership_not_found']);

/**
 * Why a change was not saved, as Desktop says it. `gone` means the group
 * or membership was removed elsewhere, so the screen should go back.
 */
export function mobileDirectorySaveError(
  locale: MessageLocale,
  body: unknown,
  message: string,
): { message: string; gone: boolean } {
  const t = createTranslator(locale);
  const code = readMobileDirectoryErrorCode(body);
  const serverMessage = body && typeof body === 'object'
    ? ((body as { error?: { message?: unknown } }).error?.message)
    : undefined;
  if (code && GONE_CODES.has(code)) {
    return {
      message: t(code === 'cattery_not_found' ? messageKeys.catteryHomeNotFoundTitle : messageKeys.clowderHomeNotFoundTitle),
      gone: code !== 'membership_not_found',
    };
  }
  if (code === 'directory_unreadable') return { message: t(messageKeys.directoryErrorUnreadable), gone: false };
  if (code === 'directory_newer') return { message: t(messageKeys.directoryErrorNewer), gone: false };
  if (code === 'directory_name_required') return { message: t(messageKeys.directoryErrorNameRequired), gone: false };
  if (code === 'cattery_domain_invalid') return { message: t(messageKeys.directoryErrorDomainInvalid), gone: false };
  return {
    message: t(messageKeys.directoryErrorSaveFailed, {
      message: typeof serverMessage === 'string' && serverMessage ? serverMessage : message,
    }),
    gone: false,
  };
}

/** The group a create made: the one that was not there before, else the newest. */
export function findCreatedMobileGroupId(
  before: MobileDirectoryView | null,
  after: MobileDirectoryView,
  kind: MobileDirectoryKind,
): string | null {
  const list = kind === 'clowder' ? after.clowders : after.catteries;
  const known = new Set((before ? (kind === 'clowder' ? before.clowders : before.catteries) : []).map((group) => group.id));
  const created = list.filter((group) => !known.has(group.id));
  return (created.at(-1) ?? list.at(-1))?.id ?? null;
}

export interface MobileDirectoryEditCopy {
  editAction: string;
  cancelAction: string;
  addAction: string;
  doneAction: string;
  nameLabel: string;
  descriptionLabel: string;
  clowderDescriptionPlaceholder: string;
  catteryDescriptionPlaceholder: string;
  domainLabel: string;
  parentHeading: string;
  parentNone: string;
  parentNoneHint: string;
  parentFixedHint: string;
  saveClowderAction: string;
  saveCatteryAction: string;
  newClowderTitle: string;
  newCatteryTitle: string;
  /** `{name}` is the Cattery. */
  newClowderInCattery: string;
  addCatAction: string;
  addCatHint: string;
  addCatNone: string;
  noCats: string;
  memberMoreLabel: string;
  makeLead: string;
  removeLead: string;
  clowderStatusHeading: string;
  catteryRoleHeading: string;
  catteryStatusHeading: string;
  statusFormal: string;
  statusTemp: string;
  statusExternal: string;
  roleOwner: string;
  roleAdmin: string;
  roleMember: string;
  endDateLabel: string;
  endDatePlaceholder: string;
  endDateHint: string;
  endDateInvalid: string;
  moveTo: string;
  alsoAdd: string;
  moveChoose: string;
  moveAlreadyIn: string;
  moveNoTargets: string;
  /** `{name}` is the Cat, `{group}` its current Clowder. */
  moveModeMoveHint: string;
  moveModeAddHint: string;
  /** `{group}` is the target. */
  moveConfirmMove: string;
  moveConfirmAdd: string;
  removeFromClowder: string;
  removeFromCattery: string;
  viewProfile: string;
  deleteClowderAction: string;
  deleteCatteryAction: string;
}

/** Desktop's wording, plus the few strings only the phone needs. */
export function getMobileDirectoryEditCopy(locale: MessageLocale): MobileDirectoryEditCopy {
  const t = createTranslator(locale);
  const zh = locale === 'zh-TW';
  return {
    editAction: zh ? '編輯' : 'Edit',
    cancelAction: t(messageKeys.sharedCatsCreateCancel),
    addAction: zh ? '加入' : 'Add',
    doneAction: zh ? '完成' : 'Done',
    nameLabel: t(messageKeys.directoryNameLabel),
    descriptionLabel: t(messageKeys.directoryDescriptionLabel),
    clowderDescriptionPlaceholder: t(messageKeys.clowdersCanvasDescriptionPlaceholder),
    catteryDescriptionPlaceholder: t(messageKeys.catteriesCanvasDescriptionPlaceholder),
    domainLabel: t(messageKeys.catteriesCanvasDomainLabel),
    parentHeading: t(messageKeys.clowdersCanvasParentHeading),
    parentNone: t(messageKeys.clowdersCanvasParentNone),
    parentNoneHint: t(messageKeys.clowdersCanvasParentNoneHint),
    parentFixedHint: t(messageKeys.clowdersCanvasParentFixedHint),
    saveClowderAction: t(messageKeys.clowdersCanvasSaveAction),
    saveCatteryAction: t(messageKeys.catteriesCanvasSaveAction),
    newClowderTitle: t(messageKeys.entitiesSidebarNewClowder),
    newCatteryTitle: t(messageKeys.entitiesSidebarNewCattery),
    newClowderInCattery: t(messageKeys.catteriesCanvasNewClowder),
    addCatAction: t(messageKeys.directoryAddCatAction),
    addCatHint: t(messageKeys.directoryAddCatHint),
    addCatNone: t(messageKeys.directoryAddCatNone),
    noCats: t(messageKeys.directoryNoCats),
    memberMoreLabel: t(messageKeys.directoryMemberMoreAria),
    makeLead: t(messageKeys.directoryMemberMakeLead),
    removeLead: t(messageKeys.directoryMemberRemoveLead),
    clowderStatusHeading: t(messageKeys.clowdersCanvasMemberStatusHeading),
    catteryRoleHeading: t(messageKeys.catteriesCanvasMemberRoleHeading),
    catteryStatusHeading: t(messageKeys.catteriesCanvasMemberStatusHeading),
    statusFormal: t(messageKeys.directoryStatusFormal),
    statusTemp: t(messageKeys.directoryStatusTemp),
    statusExternal: t(messageKeys.directoryStatusExternal),
    roleOwner: t(messageKeys.directoryRoleOwner),
    roleAdmin: t(messageKeys.directoryRoleAdmin),
    roleMember: t(messageKeys.directoryRoleMember),
    endDateLabel: t(messageKeys.directoryMemberEndDate),
    endDatePlaceholder: 'YYYY-MM-DD',
    endDateHint: zh ? '留空表示沒有到期日。' : 'Leave empty for no end date.',
    endDateInvalid: zh ? '請用 YYYY-MM-DD 輸入一個存在的日期。' : 'Enter a real date as YYYY-MM-DD.',
    moveTo: t(messageKeys.clowdersCanvasMemberMoveTo),
    alsoAdd: t(messageKeys.clowdersCanvasMemberAlsoAdd),
    moveChoose: t(messageKeys.clowdersCanvasMoveChoose),
    moveAlreadyIn: t(messageKeys.clowdersCanvasMoveAlreadyIn),
    moveNoTargets: t(messageKeys.clowdersCanvasMoveNoTargets),
    moveModeMoveHint: t(messageKeys.clowdersCanvasMoveModeMoveHint),
    moveModeAddHint: t(messageKeys.clowdersCanvasMoveModeAddHint),
    moveConfirmMove: t(messageKeys.clowdersCanvasMoveConfirmMove),
    moveConfirmAdd: t(messageKeys.clowdersCanvasMoveConfirmAdd),
    removeFromClowder: t(messageKeys.clowdersCanvasMemberRemove),
    removeFromCattery: t(messageKeys.catteriesCanvasMemberRemove),
    viewProfile: t(messageKeys.catProfileViewProfileAction),
    deleteClowderAction: t(messageKeys.clowdersCanvasDeleteConfirm),
    deleteCatteryAction: t(messageKeys.catteriesCanvasDeleteConfirm),
  };
}

/** Fills `{key}` placeholders in a copy string. */
export function fillMobileCopy(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^{}]+)\}/g, (match, key: string) => values[key] ?? match);
}
