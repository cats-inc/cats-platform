import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import type {
  CodeWorkspaceKind,
  CodeWorkspaceOwnershipState,
  CodeWorkspaceSummary,
} from '../../shared/workspaceSummary.js';

export type CodeWorkspaceTranslate = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

export function labelCodeWorkspaceKindForLocale(
  workspaceKind: CodeWorkspaceKind,
  t: CodeWorkspaceTranslate,
): string {
  switch (workspaceKind) {
    case 'conversation_repo':
      return t(messageKeys.codeWorkspaceKindConversationRepo);
    case 'managed_room':
      return t(messageKeys.codeWorkspaceKindManagedRoom);
    default:
      return t(messageKeys.codeWorkspaceKindUserSelected);
  }
}

export function labelCodeWorkspaceOwnershipStateForLocale(
  ownershipState: CodeWorkspaceOwnershipState,
  t: CodeWorkspaceTranslate,
): string {
  switch (ownershipState) {
    case 'conversation_bound':
      return t(messageKeys.codeWorkspaceOwnershipConversationBound);
    case 'room_owned':
      return t(messageKeys.codeWorkspaceOwnershipRoomOwned);
    default:
      return t(messageKeys.codeWorkspaceOwnershipOwnerSelected);
  }
}

export function describeCodeWorkspaceBindingForLocale(
  summary: CodeWorkspaceSummary,
  t: CodeWorkspaceTranslate,
): string {
  switch (summary.workspaceKind) {
    case 'conversation_repo':
      return t(messageKeys.codeWorkspaceSummaryBindingConversationRepo);
    case 'managed_room':
      return t(messageKeys.codeWorkspaceSummaryBindingManagedRoom);
    default:
      return t(messageKeys.codeWorkspaceSummaryBindingUserSelected);
  }
}
