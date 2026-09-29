import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';
import { getProviderDisplayName, getProviderInstances } from '../../../shared/providerCatalog.js';

export interface DeleteProviderTarget {
  provider?: string | null;
  instance?: string | null;
}

export interface DeleteChannelContext {
  channels: ReadonlyArray<{ id: string; pendingProvider?: string | null; defaultRecipientCatId?: string | null }>;
  cats?: ReadonlyArray<{ id: string; defaultExecutionTarget?: DeleteProviderTarget }>;
  selectedChannel?: {
    id: string;
    orchestratorLease?: DeleteProviderTarget;
    catAssignments?: ReadonlyArray<{ execution: { lease: DeleteProviderTarget } }>;
    participantAssignments?: ReadonlyArray<{ execution: { lease: DeleteProviderTarget } }>;
  } | null;
}

// Runtime removes discovery transcripts and native-session state for these CLIs.
const nativeTranscriptProviders = new Set([
  'claude', 'junie', 'cline', 'grok', 'muse', 'copilot', 'antigravity',
  'auggie', 'codex', 'pi', 'cursor', 'kiro', 'goose', 'opencode', 'kilo',
]);

export function channelDeleteTargets(chat: DeleteChannelContext, channelId: string): DeleteProviderTarget[] {
  const selected = chat.selectedChannel?.id === channelId ? chat.selectedChannel : null;
  const leases = selected ? [selected.orchestratorLease,
    ...(selected.participantAssignments ?? selected.catAssignments ?? []).map((item) => item.execution.lease),
  ].filter((target): target is DeleteProviderTarget => Boolean(target?.provider)) : [];
  if (leases.length) return leases;
  // Current defaults/pending choices do not identify an older linked session.
  // Unselected channels lack authoritative leases: keep the native warning generic.
  return [];
}

export function sessionDeletionWarning(
  targets: ReadonlyArray<DeleteProviderTarget>,
  t: DeleteConfirmationTranslator = defaultDeleteConfirmationTranslator,
): string {
  const names = [...new Set(targets.filter((target) => {
    const provider = target.provider?.replace(/-cli$/u, '') ?? '';
    const backend = getProviderInstances(provider).find((entry) => entry.id === target.instance)?.backend;
    return nativeTranscriptProviders.has(provider)
      && !/^(api|local|agent)(\/|$)/u.test(target.instance ?? '')
      && (!backend || backend === 'cli');
  }).map((target) => getProviderDisplayName(target.provider!.replace(/-cli$/u, ''))))];
  return names.length ? t(messageKeys.sharedDeleteNativeTranscriptWarning, { providers: names.join(', ') })
    : targets.length ? t(messageKeys.sharedDeleteSessionWarning)
      : t(messageKeys.sharedDeleteUnknownTranscriptWarning);
}

export function buildDeleteChannelConfirmation(
  title: string | null | undefined,
  targets: ReadonlyArray<DeleteProviderTarget>,
  t: DeleteConfirmationTranslator = defaultDeleteConfirmationTranslator,
): DeleteConfirmationCopy {
  return {
    title: t(messageKeys.sharedDeleteChannelTitle),
    message: `${t(messageKeys.sharedDeleteChannelMessage, { title: title?.trim() || t(messageKeys.sharedDeleteChannelFallback) })} ${sessionDeletionWarning(targets, t)}`,
    confirmLabel: t(messageKeys.sharedDeletePermanently),
  };
}

export interface DeleteConfirmationCopy {
  title: string;
  message: string;
  confirmLabel: string;
}

type DeleteConfirmationTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultDeleteConfirmationTranslator = createTranslator('en');

function readEntityLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function buildDeleteParallelChatGroupConfirmation(
  groupTitle?: string | null,
  t: DeleteConfirmationTranslator = defaultDeleteConfirmationTranslator,
  targets: ReadonlyArray<DeleteProviderTarget> = [],
): DeleteConfirmationCopy {
  const label = readEntityLabel(
    groupTitle,
    t(messageKeys.sharedDeleteParallelChatGroupFallback),
  );
  return {
    title: t(messageKeys.sharedDeleteParallelChatGroupTitle),
    message: t(messageKeys.sharedDeleteParallelChatGroupMessage, {
      groupTitle: label,
    }) + ' ' + sessionDeletionWarning(targets, t),
    confirmLabel: t(messageKeys.sharedDeleteParallelChatGroupConfirm),
  };
}

export function buildDeleteCatConfirmation(
  catName?: string | null,
  t: DeleteConfirmationTranslator = defaultDeleteConfirmationTranslator,
  targets: ReadonlyArray<DeleteProviderTarget> = [],
): DeleteConfirmationCopy {
  const label = readEntityLabel(catName, t(messageKeys.sharedDeleteCatFallback));
  return {
    title: t(messageKeys.sharedDeleteCatTitle),
    message: t(messageKeys.sharedDeleteCatMessage, { catName: label }) + ' ' + sessionDeletionWarning(targets, t),
    confirmLabel: t(messageKeys.sharedDeleteCatConfirm),
  };
}
