import { useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';

/**
 * Channel-mode ChatView host. See `chat/[channelId].tsx` — the
 * Stack header title is owned by `ChatView`.
 */
export default function ChatViewWorkModeScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const resolvedChannelId =
    typeof channelId === 'string' && channelId.length > 0
      ? channelId
      : 'unknown-channel';

  return (
    <ChatView
      target={{ kind: 'channel', channelId: resolvedChannelId }}
      productMode="work"
    />
  );
}
