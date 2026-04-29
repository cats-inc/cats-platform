import { Stack, useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';

export default function ChatViewChatModeScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const resolvedChannelId =
    typeof channelId === 'string' && channelId.length > 0
      ? channelId
      : 'unknown-channel';

  return (
    <>
      <Stack.Screen options={{ title: 'Chat', headerShown: true }} />
      <ChatView channelId={resolvedChannelId} productMode="chat" />
    </>
  );
}
