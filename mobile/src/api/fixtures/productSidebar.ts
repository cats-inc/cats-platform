import type { TrimmedSidebarConfig } from '../../renderer/sidebars/types';
import {
  getMobileProductSidebarCopy,
  type MobileProductMode,
  type MobileTabsCopy,
} from '../../../../src/mobile/index.js';

const SIDEBAR_ACTION_IDS: Record<
  MobileProductMode,
  TrimmedSidebarConfig['primaryActions'][number]['id'][]
> = {
  chat: ['new', 'group', 'parallel'],
  code: ['new', 'team', 'peer'],
  work: ['new', 'team', 'parallel'],
};

/**
 * Trimmed sidebar configs for the Chat / Code / Work tabs. Each tab
 * renders three primary action chips plus a Recents list — the
 * MY-lens section (DIRECT MESSAGES / MY CLOWDERS / MY CATTERIES) was
 * removed in 2026-05-05 once the platform-level Cats tab took over
 * cat / clowder / cattery rosters. Code's Workspaces / Artifacts and
 * Work's Projects / Work Items / Tasks / Runs / Missions remain
 * explicitly out of scope for mobile.
 *
 * Chat's three primary actions mirror the canonical web entry kinds
 * (+New Chat / +Group Chat / +Parallel Chat). Code's match FR-038
 * (+New Code / +Team Code / +Peer Code). Work mirrors the same shape
 * (+New Work / +Team Work / +Parallel Work).
 */
function createSidebarConfig(
  product: MobileProductMode,
  locale?: string | null,
): TrimmedSidebarConfig {
  const copy = getMobileProductSidebarCopy(locale);
  const productCopy = copy.products[product];
  return {
    product,
    productLabel: productCopy.productLabel,
    primaryActions: SIDEBAR_ACTION_IDS[product].map((id) => ({
      id,
      label: productCopy.primaryActions[id] ?? id,
    })) as TrimmedSidebarConfig['primaryActions'],
    recentsLabel: productCopy.recentsLabel,
    emptyRecentsLabel: copy.emptyRecentsLabel,
  };
}

export function getChatSidebarConfig(locale?: string | null): TrimmedSidebarConfig {
  return createSidebarConfig('chat', locale);
}

export function getCodeSidebarConfig(locale?: string | null): TrimmedSidebarConfig {
  return createSidebarConfig('code', locale);
}

export function getWorkSidebarConfig(locale?: string | null): TrimmedSidebarConfig {
  return createSidebarConfig('work', locale);
}

export const chatSidebarConfig: TrimmedSidebarConfig = getChatSidebarConfig('en');
export const codeSidebarConfig: TrimmedSidebarConfig = getCodeSidebarConfig('en');
export const workSidebarConfig: TrimmedSidebarConfig = getWorkSidebarConfig('en');

/**
 * The mobile create-channel contract supports `default | group | direct`
 * only. A handful of primary-action chips on Chat and Work map to a
 * "parallel" / "fan-out" creation flow that is desktop-only today.
 * `getMobileDesktopOnlyAlertCopy` is the single source of truth for
 * "for this (product, actionId), should the tab show a desktop-only
 * alert instead of calling createChannel?" — both `chat/index.tsx`
 * and `work/index.tsx` consume it so a future product can opt into
 * the same intercept without re-implementing the predicate. Returning
 * `null` means the action goes through the normal create-channel
 * path.
 */
export interface MobileDesktopOnlyAlertCopy {
  title: string;
  body: string;
}

export function getMobileDesktopOnlyAlertCopy(
  product: MobileProductMode,
  actionId: string,
  copy: MobileTabsCopy,
): MobileDesktopOnlyAlertCopy | null {
  if (product === 'chat' && actionId === 'parallel') {
    return {
      title: copy.parallelChatDesktopOnlyTitle,
      body: copy.parallelChatDesktopOnlyBody,
    };
  }
  if (product === 'work' && actionId === 'parallel') {
    return {
      title: copy.parallelWorkDesktopOnlyTitle,
      body: copy.parallelWorkDesktopOnlyBody,
    };
  }
  return null;
}
