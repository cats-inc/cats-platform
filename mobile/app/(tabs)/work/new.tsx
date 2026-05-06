import { useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';

/**
 * Work-mode draft. See `chat/new.tsx` for the full draft-route
 * lifecycle rationale. Channel creation is deferred to first send
 * via `useDraftChannel`. Stack header title is owned by `ChatView`.
 */
export default function WorkNewDraftScreen() {
  const { entryKind } = useLocalSearchParams<{ entryKind?: string }>();
  const resolvedEntryKind =
    typeof entryKind === 'string' && entryKind.length > 0 ? entryKind : 'new';

  return (
    <ChatView
      target={{ kind: 'draft', entryActionId: resolvedEntryKind }}
      productMode="work"
    />
  );
}
