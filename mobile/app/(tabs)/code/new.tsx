import { Stack, useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';
import {
  getMobileChannelTitle,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

/**
 * Code-mode draft. See `chat/new.tsx` for the full draft-route
 * lifecycle rationale. Channel creation is deferred to first send
 * via `useDraftChannel`.
 */
export default function CodeNewDraftScreen() {
  const { entryKind } = useLocalSearchParams<{ entryKind?: string }>();
  const resolvedEntryKind =
    typeof entryKind === 'string' && entryKind.length > 0 ? entryKind : 'new';
  const copy = getMobileTabsCopy(resolveDefaultMobileLocale());
  const headerTitle = getMobileChannelTitle(copy, 'code', resolvedEntryKind);

  return (
    <>
      <Stack.Screen options={{ title: headerTitle, headerShown: true }} />
      <ChatView
        target={{ kind: 'draft', entryActionId: resolvedEntryKind }}
        productMode="code"
      />
    </>
  );
}
