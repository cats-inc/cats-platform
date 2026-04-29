import { Stack, useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';

export default function ChatViewWorkModeScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const resolvedChannelId =
    typeof channelId === 'string' && channelId.length > 0
      ? channelId
      : 'unknown-channel';

  return (
    <>
      <Stack.Screen options={{ title: 'Work', headerShown: true }} />
      <ChatView channelId={resolvedChannelId} productMode="work" />
    </>
  );
}
