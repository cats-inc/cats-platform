import { membershipsOfCat } from '../shared/directoryMembership.js';
import { createTranslator, messageKeys, type MessageLocale } from '../shared/i18n/index.js';
import { localizeSettingsCatsRegistryErrorMessage } from '../products/shared/renderer/hooks/settingsCatsRegistryErrorLabels.js';
import type {
  MobileAppShellPayload,
  MobileChatCat,
  MobileCreateCatInput,
  MobileDirectoryView,
  MobileMembershipStatus,
  MobileModelSelection,
  MobileProviderModelCatalog,
  MobileUpdateCatInput,
} from './contracts.js';
import { formatMobileDirectoryDate } from './directory.js';
import { isMembershipEnded } from '../shared/directoryMembership.js';

/**
 * A Cat on the phone (SPEC-095 FR-17 as amended, SPEC-103): its screen,
 * and the core changes the phone makes with the requests Desktop sends.
 * Avatars, skills, memory, MCP and Telegram stay in Desktop Settings.
 */

export interface MobileCatRequest {
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
}

const catPath = (catId: string) => `/api/cats/${encodeURIComponent(catId)}`;

export const mobileCatRequests = {
  create: (input: MobileCreateCatInput): MobileCatRequest => ({ method: 'POST', path: '/api/cats', body: input }),
  update: (catId: string, patch: MobileUpdateCatInput): MobileCatRequest =>
    ({ method: 'PATCH', path: catPath(catId), body: patch }),
  remove: (catId: string): MobileCatRequest => ({ method: 'DELETE', path: catPath(catId) }),
} as const;

/** `GET` paths for the provider picker. */
export const mobileProviderPaths = {
  registry: '/api/providers',
  models: (provider: string, instance: string | null) =>
    `/api/providers/${encodeURIComponent(provider)}/models${instance ? `?instance=${encodeURIComponent(instance)}` : ''}`,
} as const;

/**
 * A plain model pick, the same record `createExplicitProviderModelSelection`
 * makes on Desktop (a test keeps them equal). It replaces the Cat's saved
 * selection, so advanced controls such as effort return to the model's
 * defaults rather than staying behind from another model.
 */
export function createMobileModelSelection(model: string, catalogRevision?: string): MobileModelSelection | null {
  const entryId = model.trim();
  if (!entryId) return null;
  return { entryId, entryMode: 'explicit', ...(catalogRevision ? { catalogRevision } : {}) };
}

/** The fields that set a Cat's model. */
export function mobileModelChange(
  provider: string,
  instance: string | null,
  model: string,
  catalog: Pick<MobileProviderModelCatalog, 'catalogRevision'> | null,
): Required<Pick<MobileUpdateCatInput, 'provider' | 'instance' | 'model' | 'modelSelection'>> {
  return {
    provider,
    instance,
    model,
    modelSelection: createMobileModelSelection(model, catalog?.catalogRevision),
  };
}

/** The model a picker opens on: the Cat's when it is listed, else the catalog's default. */
export function pickMobileDefaultModel(catalog: MobileProviderModelCatalog, current: string | null): string | null {
  if (current && catalog.models.some((model) => model.id === current)) return current;
  return catalog.models.find((model) => model.default)?.id
    ?? (catalog.defaultModel && catalog.models.some((model) => model.id === catalog.defaultModel) ? catalog.defaultModel : null)
    ?? catalog.models[0]?.id
    ?? null;
}

export interface MobileCatMembershipTag {
  kind: 'clowder' | 'cattery';
  id: string;
  name: string;
  role: string;
  status: MobileMembershipStatus;
  /** Null for a formal member. */
  statusLabel: string | null;
  ended: boolean;
}

export interface MobileCatProfile {
  cat: MobileChatCat;
  isBoss: boolean;
  archived: boolean;
  /** Such as "Claude-CLI · Opus 5.5 · medium"; null when the server does not say. */
  executionLabel: string | null;
  /** Archiving removes a Cat's bot bindings, so its confirmation says so. */
  hasBotBinding: boolean;
  /**
   * The Cat's Catteries, then its Clowders. Null when unknown: the
   * Directory has not loaded, or the Cat is archived, whose memberships
   * the Directory hides until it is restored.
   */
  memberships: MobileCatMembershipTag[] | null;
}

export function selectMobileCatProfile(
  payload: MobileAppShellPayload,
  directory: MobileDirectoryView | null,
  catId: string,
  locale: MessageLocale,
  now: Date = new Date(),
): MobileCatProfile | null {
  const cat = payload.chat.cats.find((candidate) => candidate.id === catId);
  if (!cat) return null;
  const t = createTranslator(locale);
  const archived = cat.status !== 'active';
  const statusLabel = (status: MobileMembershipStatus, expiresAt: string | null) => {
    if (status === 'formal') return null;
    if (status === 'temp' && expiresAt) {
      return t(isMembershipEnded(status, expiresAt, now) ? messageKeys.directoryStatusTempEnded : messageKeys.directoryStatusTempUntil, {
        date: formatMobileDirectoryDate(expiresAt, locale),
      });
    }
    return t(status === 'temp' ? messageKeys.directoryStatusTemp : messageKeys.directoryStatusExternal);
  };
  let memberships: MobileCatMembershipTag[] | null = null;
  if (directory && !archived) {
    const found = membershipsOfCat(directory, catId);
    memberships = [
      ...found.catteries.map(({ group, member }) => ({
        kind: 'cattery' as const,
        id: group.id,
        name: group.name,
        role: t(member.role === 'owner'
          ? messageKeys.directoryRoleOwner
          : member.role === 'admin' ? messageKeys.directoryRoleAdmin : messageKeys.directoryRoleMember),
        status: member.status,
        statusLabel: statusLabel(member.status, null),
        ended: false,
      })),
      ...found.clowders.map(({ group, member }) => ({
        kind: 'clowder' as const,
        id: group.id,
        name: group.name,
        role: t(member.role === 'lead' ? messageKeys.directoryRoleLead : messageKeys.directoryRoleMember),
        status: member.status,
        statusLabel: statusLabel(member.status, member.expiresAt),
        ended: isMembershipEnded(member.status, member.expiresAt, now),
      })),
    ];
  }
  return {
    cat,
    isBoss: cat.group === 'admin',
    archived,
    executionLabel: payload.lobby?.cats?.find((entry) => entry.id === catId)?.executionLabel ?? null,
    hasBotBinding: (payload.chat.botBindings ?? []).some((binding) => binding.catId === catId),
    memberships,
  };
}

/** Whether another active Cat fits; unknown on an older server, which then answers for itself. */
export function mobileCatLimit(payload: MobileAppShellPayload): { reached: boolean; max: number | null } {
  const max = payload.chat.capabilities?.maxCats ?? null;
  const active = payload.chat.cats.filter((cat) => cat.status === 'active').length;
  return { reached: max !== null && active >= max, max };
}

/** Why a Cat change was not saved, in Desktop's words. */
export function mobileCatSaveError(locale: MessageLocale, body: unknown, message: string): string {
  const t = createTranslator(locale);
  const serverMessage = body && typeof body === 'object'
    ? (body as { error?: { message?: unknown } }).error?.message
    : undefined;
  const raw = typeof serverMessage === 'string' && serverMessage ? serverMessage : message;
  return localizeSettingsCatsRegistryErrorMessage(raw, t) ?? raw;
}

export interface MobileCatCopy {
  newCatTitle: string;
  saveCatAction: string;
  saveAction: string;
  cancelAction: string;
  doneAction: string;
  editAction: string;
  namePlaceholder: string;
  nameLabel: string;
  providerLabel: string;
  modelLabel: string;
  loadingProviders: string;
  loadingModels: string;
  selectModel: string;
  noModels: string;
  runtimeUnreachable: string;
  noUsableTargets: string;
  providerLoadFailed: string;
  modelResetHint: string;
  bossLabel: string;
  bossBadge: string;
  archivedBadge: string;
  archiveAction: string;
  archiveConfirmTitle: string;
  /** `{catName}` is the Cat. */
  archiveConfirmMessage: string;
  /** For a Cat with a bot binding, which archiving removes. */
  archiveWithBotConfirmMessage: string;
  recoverAction: string;
  recoverConfirmAction: string;
  recoverConfirmTitle: string;
  recoverConfirmMessage: string;
  deleteAction: string;
  deleteConfirmTitle: string;
  /** `{catName}` is the Cat. */
  deleteConfirmMessage: string;
  deleteConfirmAction: string;
  directMessage: string;
  limitReached: string;
  membershipsHeading: string;
  settingsHeading: string;
  desktopOnlyHint: string;
  notFoundTitle: string;
}

/** Desktop's wording, plus the few strings only the phone needs. */
export function getMobileCatCopy(locale: MessageLocale): MobileCatCopy {
  const t = createTranslator(locale);
  const zh = locale === 'zh-TW';
  return {
    newCatTitle: t(messageKeys.sharedCatsCreateNewCat),
    saveCatAction: t(messageKeys.sharedCatsCreateSaveCat),
    saveAction: zh ? '儲存' : 'Save',
    cancelAction: t(messageKeys.sharedCatsCreateCancel),
    doneAction: zh ? '完成' : 'Done',
    editAction: zh ? '編輯' : 'Edit',
    namePlaceholder: t(messageKeys.sharedCatsCreateCatNamePlaceholder),
    nameLabel: t(messageKeys.directoryNameLabel),
    providerLabel: t(messageKeys.sharedProviderModelFieldProviderLabel),
    modelLabel: t(messageKeys.sharedProviderModelFieldModelLabel),
    loadingProviders: t(messageKeys.sharedProviderModelFieldLoadingProviders),
    loadingModels: t(messageKeys.sharedProviderModelFieldLoadingModels),
    selectModel: t(messageKeys.sharedProviderModelFieldSelectModel),
    noModels: t(messageKeys.sharedProviderModelFieldNoModels),
    runtimeUnreachable: t(messageKeys.sharedProviderModelFieldRegistryLoadFailedHint),
    noUsableTargets: t(messageKeys.sharedProviderModelFieldRegistryEmptyHint),
    providerLoadFailed: t(messageKeys.sharedProviderModelFieldProviderLoadFailed),
    modelResetHint: zh
      ? '換模型後，推理強度等進階設定會回到這個模型的預設值；要細調請到桌面版。'
      : 'After a model change, advanced settings such as effort return to that model’s defaults. Fine-tune them on Desktop.',
    bossLabel: t(messageKeys.sharedSettingsCatsSetBossCatLabel),
    bossBadge: zh ? '主控貓' : 'Boss Cat',
    archivedBadge: t(messageKeys.sharedSettingsCatsStatusArchived),
    archiveAction: t(messageKeys.sharedSettingsCatsArchiveLabel),
    archiveConfirmTitle: t(messageKeys.sharedSettingsCatsArchiveConfirmTitle),
    archiveConfirmMessage: t(messageKeys.sharedSettingsCatsArchiveConfirmMessage),
    archiveWithBotConfirmMessage: t(messageKeys.sharedSettingsCatsArchiveWithTelegramConfirmMessage),
    recoverAction: t(messageKeys.sharedSettingsCatsRegistryRecoverLabel),
    recoverConfirmAction: t(messageKeys.sharedSettingsCatsRecoverConfirmLabel),
    recoverConfirmTitle: t(messageKeys.sharedSettingsCatsRecoverConfirmTitle),
    recoverConfirmMessage: t(messageKeys.sharedSettingsCatsRecoverConfirmMessage),
    deleteAction: t(messageKeys.sharedSettingsCatsDeleteLabel),
    // Desktop's confirmation as Settings shows it, which does not know the Cat's sessions.
    deleteConfirmTitle: t(messageKeys.sharedDeleteCatTitle),
    deleteConfirmMessage: `${t(messageKeys.sharedDeleteCatMessage)} ${t(messageKeys.sharedDeleteUnknownTranscriptWarning)}`,
    deleteConfirmAction: t(messageKeys.sharedDeleteCatConfirm),
    directMessage: t(messageKeys.conversationSidebarDirectMessageButton),
    limitReached: t(messageKeys.sharedCatsCreateCatLimitReached),
    membershipsHeading: t(messageKeys.catProfileMembershipsAriaLabel),
    settingsHeading: zh ? '設定' : 'Settings',
    desktopOnlyHint: zh
      ? '頭像、技能、記憶、MCP 和 Telegram 請在桌面版的設定裡調整。'
      : 'Change the avatar, skills, memory, MCP and Telegram in Desktop Settings.',
    notFoundTitle: t(messageKeys.catProfileNotFoundTitle),
  };
}
