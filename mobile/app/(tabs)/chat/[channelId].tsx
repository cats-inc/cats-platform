import { useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';

/**
 * Channel-mode ChatView host. The Stack header title is owned by
 * `ChatView` (it knows the live `channelTitle` from
 * `useChannelMessages`); this route just resolves the params and
 * mounts the view.
 */
export default function ChatViewChatModeScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const resolvedChannelId =
    typeof channelId === 'string' && channelId.length > 0
      ? channelId
      : 'unknown-channel';

  return (
    <ChatView
      target={{ kind: 'channel', channelId: resolvedChannelId }}
      productMode="chat"
    />
  );
}
