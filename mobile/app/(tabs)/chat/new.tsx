import { useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';

/**
 * Mirrors the web `/chat/new` draft route. Mounting this screen does
 * NOT create a channel — the user sees an empty `ChatView` with the
 * draft title in the Stack header (owned by `ChatView`). The first
 * send runs through `useDraftChannel`, which POSTs `/api/channels`,
 * posts the first message, then `router.replace`s to the real channel
 * route. Backing out without sending leaves no trace on the desktop.
 */
export default function ChatNewDraftScreen() {
  const { entryKind } = useLocalSearchParams<{ entryKind?: string }>();
  const resolvedEntryKind =
    typeof entryKind === 'string' && entryKind.length > 0 ? entryKind : 'new';

  return (
    <ChatView
      target={{ kind: 'draft', entryActionId: resolvedEntryKind }}
      productMode="chat"
    />
  );
}
