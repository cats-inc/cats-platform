import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { MobileApiError } from '../../../src/api/client';
import { useChatSidebarData } from '../../../src/renderer/hooks/useChatSidebarData';
import { ChatSidebar } from '../../../src/renderer/sidebars/ChatSidebar';
import type { ChatSidebarCallbacks } from '../../../src/renderer/sidebars/types';
import { colors, radii, spacing, typography } from '../../../src/renderer/theme';

const NEW_CHAT_PLACEHOLDER_ID = 'new-chat';
const NEW_GROUP_CHAT_PLACEHOLDER_ID = 'new-group-chat';
const NEW_PARALLEL_CHAT_PLACEHOLDER_ID = 'new-parallel-chat';

export default function ChatSidebarScreen() {
  const router = useRouter();
  const { state, refetch } = useChatSidebarData();

  const pushChat = (channelId: string) => {
    router.push(`/(tabs)/chat/${channelId}`);
  };

  const callbacks = {
    onStartNewChat: () => pushChat(NEW_CHAT_PLACEHOLDER_ID),
    onStartNewGroupChat: () => pushChat(NEW_GROUP_CHAT_PLACEHOLDER_ID),
    onStartNewParallelChat: () => pushChat(NEW_PARALLEL_CHAT_PLACEHOLDER_ID),
    onSelectRecent: (channelId: string) => pushChat(channelId),
    onSelectCat: (catId: string) => pushChat(`direct-${catId}`),
    onCreateNewCat: () => pushChat(NEW_CHAT_PLACEHOLDER_ID),
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderBody({
        state,
        callbacks,
        onOpenSettings: () => router.push('/(tabs)/settings'),
        onRetry: refetch,
      })}
    </SafeAreaView>
  );
}

interface RenderBodyArgs {
  state: ReturnType<typeof useChatSidebarData>['state'];
  callbacks: ChatSidebarCallbacks;
  onOpenSettings: () => void;
  onRetry: () => void;
}

function renderBody({ state, callbacks, onOpenSettings, onRetry }: RenderBodyArgs) {
  switch (state.kind) {
    case 'loading':
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      );
    case 'unconfigured':
      return (
        <UnconfiguredPanel onOpenSettings={onOpenSettings} />
      );
    case 'error':
      return <ErrorPanel error={state.error} onRetry={onRetry} />;
    case 'data':
      return <ChatSidebar {...callbacks} data={state.data} />;
  }
}

interface UnconfiguredPanelProps {
  onOpenSettings: () => void;
}

function UnconfiguredPanel({ onOpenSettings }: UnconfiguredPanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Connect to your desktop</Text>
      <Text style={styles.panelBody}>
        Set the desktop base URL in Settings so this device can fetch your
        chat shell. LAN, Tailscale, or tunnel URL all work.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenSettings}
        style={({ pressed }) => [
          styles.panelButton,
          pressed ? styles.panelButtonPressed : null,
        ]}
      >
        <Text style={styles.panelButtonLabel}>Open Settings</Text>
      </Pressable>
    </View>
  );
}

interface ErrorPanelProps {
  error: MobileApiError;
  onRetry: () => void;
}

function ErrorPanel({ error, onRetry }: ErrorPanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Could not reach desktop cats</Text>
      <Text style={styles.panelBody}>{error.message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.panelButton,
          pressed ? styles.panelButtonPressed : null,
        ]}
      >
        <Text style={styles.panelButtonLabel}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  panelTitle: {
    color: colors.fg.primary,
    ...typography.title,
  },
  panelBody: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  panelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.accent.primary,
    marginTop: spacing.sm,
  },
  panelButtonPressed: {
    opacity: 0.85,
  },
  panelButtonLabel: {
    color: colors.fg.inverse,
    ...typography.bodyStrong,
  },
});
