import { useRouter } from 'expo-router';
import { useCallback } from 'react';
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
import {
  type CreateChannelHook,
  useCreateChannel,
} from '../../../src/renderer/hooks/useCreateChannel';
import { ChatSidebar } from '../../../src/renderer/sidebars/ChatSidebar';
import type { ChatSidebarCallbacks } from '../../../src/renderer/sidebars/types';
import { colors, radii, spacing, typography } from '../../../src/renderer/theme';

export default function ChatSidebarScreen() {
  const router = useRouter();
  const { state, refetch } = useChatSidebarData();
  const createChannel = useCreateChannel();

  const startChat = useCallback(
    async (
      input: Parameters<CreateChannelHook['create']>[0],
      directCatId?: string,
    ) => {
      try {
        const channelId = directCatId
          ? `direct-${directCatId}`
          : await createChannel.create(input);
        router.push(`/(tabs)/chat/${channelId}`);
      } catch {
        // hook state already carries the error; banner renders below.
      }
    },
    [createChannel, router],
  );

  const callbacks: ChatSidebarCallbacks = {
    onStartNewChat: () => {
      void startChat({
        title: 'New chat',
        topic: '',
        originSurface: 'chat',
        entryKind: 'solo',
      });
    },
    onStartNewGroupChat: () => {
      void startChat({
        title: 'New group chat',
        topic: '',
        originSurface: 'chat',
        entryKind: 'group',
      });
    },
    onStartNewParallelChat: () => {
      // POST /api/parallel-chats lands when parallel-chat creation
      // is wired through the boundary. Until then surface a clear
      // message rather than navigating into a dead route.
      void startChat({
        title: 'New parallel chat',
        topic: '',
        originSurface: 'chat',
        entryKind: 'group',
      });
    },
    onSelectRecent: (channelId: string) => {
      router.push(`/(tabs)/chat/${channelId}`);
    },
    onSelectCat: (catId: string) => {
      void startChat(
        {
          title: 'Direct chat',
          topic: '',
          originSurface: 'chat',
          entryKind: 'direct',
        },
        catId,
      );
    },
    onCreateNewCat: () => {
      // Cat creation lives on the desktop; route to the desktop
      // dashboard via the configured URL (Settings → Advanced).
      router.push('/(tabs)/settings');
    },
  };

  return (
    <SafeAreaView style={styles.container}>
      {createChannel.state.kind === 'error' ? (
        <ErrorBanner
          error={createChannel.state.error}
          onDismiss={createChannel.reset}
        />
      ) : null}
      {renderBody({
        state,
        callbacks,
        onOpenSettings: () => router.push('/(tabs)/settings'),
        onRetry: refetch,
        creating: createChannel.state.kind === 'creating',
      })}
    </SafeAreaView>
  );
}

interface RenderBodyArgs {
  state: ReturnType<typeof useChatSidebarData>['state'];
  callbacks: ChatSidebarCallbacks;
  onOpenSettings: () => void;
  onRetry: () => void;
  creating: boolean;
}

function renderBody({
  state,
  callbacks,
  onOpenSettings,
  onRetry,
  creating,
}: RenderBodyArgs) {
  if (creating) {
    return (
      <View style={styles.creatingOverlay}>
        <ActivityIndicator color={colors.accent.primary} />
        <Text style={styles.creatingLabel}>Creating channel…</Text>
      </View>
    );
  }
  switch (state.kind) {
    case 'loading':
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      );
    case 'unconfigured':
      return <UnconfiguredPanel onOpenSettings={onOpenSettings} />;
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

interface ErrorBannerProps {
  error: MobileApiError;
  onDismiss: () => void;
}

function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText} numberOfLines={2}>
        Could not create channel: {error.message}
      </Text>
      <Pressable onPress={onDismiss}>
        <Text style={styles.errorBannerDismiss}>Dismiss</Text>
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
  creatingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  creatingLabel: {
    color: colors.fg.secondary,
    ...typography.body,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.accent.soft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  errorBannerText: {
    flex: 1,
    color: colors.accent.danger,
    ...typography.caption,
  },
  errorBannerDismiss: {
    color: colors.accent.primary,
    ...typography.label,
    fontWeight: '600',
  },
});
