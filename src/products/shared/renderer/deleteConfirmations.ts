export interface DeleteConfirmationCopy {
  title: string;
  message: string;
  confirmLabel: string;
}

function readEntityLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function buildDeleteConversationConfirmation(
  conversationTitle?: string | null,
): DeleteConfirmationCopy {
  const label = readEntityLabel(conversationTitle, 'this conversation');
  return {
    title: 'Delete conversation',
    message: `Delete "${label}"? This removes the conversation and linked runtime sessions. `
      + 'This cannot be undone.',
    confirmLabel: 'Delete',
  };
}

export function buildDeleteParallelChatGroupConfirmation(
  groupTitle?: string | null,
): DeleteConfirmationCopy {
  const label = readEntityLabel(groupTitle, 'this parallel chat');
  return {
    title: 'Delete all conversations',
    message: `Delete all conversations in "${label}"? `
      + 'This removes each conversation and linked runtime sessions. This cannot be undone.',
    confirmLabel: 'Delete all',
  };
}

export function buildDeleteCatConfirmation(
  catName?: string | null,
): DeleteConfirmationCopy {
  const label = readEntityLabel(catName, 'this cat');
  return {
    title: 'Delete cat',
    message: `Delete "${label}"? This removes the Cat and any linked runtime sessions. `
      + 'This cannot be undone.',
    confirmLabel: 'Delete',
  };
}
