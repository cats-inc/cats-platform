import { useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet } from 'react-native';

import { chatSidebarFixture } from '../../../src/api/fixtures/chatSidebar';
import { ChatSidebar } from '../../../src/renderer/sidebars/ChatSidebar';
import { colors } from '../../../src/renderer/theme';

const NEW_CHAT_PLACEHOLDER_ID = 'new-chat';
const NEW_GROUP_CHAT_PLACEHOLDER_ID = 'new-group-chat';
const NEW_PARALLEL_CHAT_PLACEHOLDER_ID = 'new-parallel-chat';

export default function ChatSidebarScreen() {
  const router = useRouter();

  const pushChat = (channelId: string) => {
    router.push(`/(tabs)/chat/${channelId}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ChatSidebar
        data={chatSidebarFixture}
        onStartNewChat={() => pushChat(NEW_CHAT_PLACEHOLDER_ID)}
        onStartNewGroupChat={() => pushChat(NEW_GROUP_CHAT_PLACEHOLDER_ID)}
        onStartNewParallelChat={() => pushChat(NEW_PARALLEL_CHAT_PLACEHOLDER_ID)}
        onSelectRecent={(channelId) => pushChat(channelId)}
        onSelectCat={(catId) => pushChat(`direct-${catId}`)}
        onCreateNewCat={() => pushChat(NEW_CHAT_PLACEHOLDER_ID)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
});
