import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
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
    async (input: Parameters<CreateChannelHook['create']>[0]) => {
      try {
        const channelId = await createChannel.create(input);
        router.push(`/(tabs)/chat/${channelId}`);
      } catch {
        // hook state already carries the error; banner renders below.
      }
    },
    [createChannel, router],
  );

  const showDesktopOnly = useCallback(
    (title: string, body: string) => {
      Alert.alert(title, body, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => router.push('/(tabs)/settings'),
        },
      ]);
    },
    [router],
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
      // Parallel chat creation goes through a different server
      // endpoint (`/api/parallel-chat-groups`) and requires a
      // `targets` array of provider/instance/model triples that the
      // mobile shell does not collect yet. Surface that honestly
      // rather than POSTing a malformed request that the desktop
      // would reject.
      showDesktopOnly(
        'Parallel chat — desktop only',
        'Parallel chat creation is not yet wired on mobile. Use the desktop app to start a parallel conversation; it will appear in Recents here once created.',
      );
    },
    onSelectRecent: (channelId: string) => {
      router.push(`/(tabs)/chat/${channelId}`);
    },
    onSelectCat: () => {
      // Direct-lane resolution requires the desktop's
      // `resolveMyCatNavigationTarget` (which finds or creates the
      // direct-lane channel for that cat). Mobile does not host that
      // resolver yet, so tapping a MY CATS row would currently land
      // on a synthetic `direct-{catId}` channel that does not exist
      // on the desktop. Surface the gap explicitly.
      showDesktopOnly(
        'Direct cat chat — desktop only',
        'Tapping a cat to start a direct conversation is not yet wired on mobile. Start the direct lane on the desktop; it will appear in Recents here once created.',
      );
    },
    onCreateNewCat: () => {
      // Cat creation only exists on the desktop. Route to Settings
      // so the user can hop into the web dashboard via the
      // Advanced → Open web dashboard entry.
      showDesktopOnly(
        'Create a cat — desktop only',
        'Cat creation lives in the desktop app. Open Settings → Advanced → Open web dashboard.',
      );
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
      // Render the sidebar shell with empty data so the user sees the
      // structure (the three +New action chips, RECENTS empty state,
      // MY CATS empty state) even before pairing — matches the
      // Code / Work tabs which use a static config and never hide the
      // sidebar. A banner above explains the empty state.
      return (
        <>
          <UnconfiguredBanner onOpenSettings={onOpenSettings} />
          <ChatSidebar {...callbacks} data={EMPTY_SIDEBAR_DATA} />
        </>
      );
    case 'error':
      return (
        <>
          <ErrorBanner error={state.error} onDismiss={onRetry} />
          <ChatSidebar {...callbacks} data={EMPTY_SIDEBAR_DATA} />
        </>
      );
    case 'data':
      return <ChatSidebar {...callbacks} data={state.data} />;
  }
}

const EMPTY_SIDEBAR_DATA: Parameters<typeof ChatSidebar>[0]['data'] = {
  recents: [],
  cats: [],
};

interface UnconfiguredBannerProps {
  onOpenSettings: () => void;
}

function UnconfiguredBanner({ onOpenSettings }: UnconfiguredBannerProps) {
  return (
    <View style={styles.infoBanner}>
      <View style={styles.infoBannerText}>
        <Text style={styles.infoBannerTitle}>Connect to your desktop</Text>
        <Text style={styles.infoBannerBody} numberOfLines={2}>
          Set the desktop base URL in Settings to load Recents and MY CATS.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenSettings}
        style={({ pressed }) => [
          styles.infoBannerButton,
          pressed ? styles.infoBannerButtonPressed : null,
        ]}
      >
        <Text style={styles.infoBannerButtonLabel}>Settings</Text>
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
        {error.message}
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent.soft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  infoBannerText: {
    flex: 1,
    gap: 2,
  },
  infoBannerTitle: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  infoBannerBody: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  infoBannerButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accent.primary,
  },
  infoBannerButtonPressed: {
    opacity: 0.85,
  },
  infoBannerButtonLabel: {
    color: colors.fg.inverse,
    ...typography.label,
    fontWeight: '600',
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
