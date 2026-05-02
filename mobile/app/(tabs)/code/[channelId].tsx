import { Stack, useLocalSearchParams } from 'expo-router';

import { ChatView } from '../../../src/renderer/ChatView';
import {
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

export default function ChatViewCodeModeScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const copy = getMobileTabsCopy(resolveDefaultMobileLocale());
  const resolvedChannelId =
    typeof channelId === 'string' && channelId.length > 0
      ? channelId
      : 'unknown-channel';

  return (
    <>
      <Stack.Screen options={{ title: copy.tabTitle.code, headerShown: true }} />
      <ChatView channelId={resolvedChannelId} productMode="code" />
    </>
  );
}
