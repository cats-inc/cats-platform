import { useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';

/**
 * Mirrors the web `/chat/new` draft route. Mounting this screen does
 * NOT create a channel — the user sees an empty `ChatView` with the
 * draft title in the Stack header (owned by `ChatView`). The first
 * send runs through `useDraftChannel`, which POSTs `/api/channels`,
 * posts the first message, then `router.replace`s to the real channel
 * route. Backing out without sending leaves no trace on the desktop.
 *
 * Direct-lane variant: when the user taps a cat in the Chat tab's
 * DIRECT MESSAGES list that has no existing DM channel, the sidebar
 * navigates here with `entryKind=direct&catId=…&catName=…`. Those
 * extras pre-attach the cat to the channel that gets created on
 * first send.
 */
export default function ChatNewDraftScreen() {
  const { entryKind, catId, catName } = useLocalSearchParams<{
    entryKind?: string;
    catId?: string;
    catName?: string;
  }>();
  const resolvedEntryKind =
    typeof entryKind === 'string' && entryKind.length > 0 ? entryKind : 'new';
  const directLane =
    resolvedEntryKind === 'direct'
    && typeof catId === 'string'
    && catId.length > 0
    && typeof catName === 'string'
    && catName.length > 0
      ? { catId, catName }
      : null;

  return (
    <ChatView
      target={{ kind: 'draft', entryActionId: resolvedEntryKind, directLane }}
      productMode="chat"
    />
  );
}
