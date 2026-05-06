import { Stack, useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';
import {
  getMobileChannelTitle,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

/**
 * Mirrors the web `/chat/new` draft route. Mounting this screen does
 * NOT create a channel — the user sees an empty `ChatView` with the
 * draft title in the header and an enabled composer. The first send
 * runs through `useDraftChannel`, which POSTs `/api/channels`, posts
 * the first message, then `router.replace`s to the real channel
 * route. Backing out without sending leaves no trace on the desktop.
 */
export default function ChatNewDraftScreen() {
  const { entryKind } = useLocalSearchParams<{ entryKind?: string }>();
  const resolvedEntryKind =
    typeof entryKind === 'string' && entryKind.length > 0 ? entryKind : 'new';
  const copy = getMobileTabsCopy(resolveDefaultMobileLocale());
  const headerTitle = getMobileChannelTitle(copy, 'chat', resolvedEntryKind);

  return (
    <>
      <Stack.Screen options={{ title: headerTitle, headerShown: true }} />
      <ChatView
        target={{ kind: 'draft', entryActionId: resolvedEntryKind }}
        productMode="chat"
      />
    </>
  );
}
