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

import { codeSidebarConfig } from '../../../src/api/fixtures/productSidebar';
import { useCreateChannel } from '../../../src/renderer/hooks/useCreateChannel';
import { TrimmedProductSidebar } from '../../../src/renderer/sidebars/TrimmedProductSidebar';
import { colors, spacing, typography } from '../../../src/renderer/theme';

export default function CodeSidebarScreen() {
  const router = useRouter();
  const createChannel = useCreateChannel();

  const handlePrimaryAction = useCallback(
    async (actionId: string) => {
      try {
        const channelId = await createChannel.create({
          title: titleForAction(actionId),
          topic: '',
          originSurface: 'code',
          entryKind: actionId === 'team' ? 'group' : 'solo',
        });
        router.push(`/(tabs)/code/${channelId}`);
      } catch {
        // hook state already carries the error; banner renders.
      }
    },
    [createChannel, router],
  );

  return (
    <SafeAreaView style={styles.container}>
      {createChannel.state.kind === 'error' ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText} numberOfLines={2}>
            Could not create channel: {createChannel.state.error.message}
          </Text>
          <Pressable onPress={createChannel.reset}>
            <Text style={styles.errorBannerDismiss}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
      {createChannel.state.kind === 'creating' ? (
        <View style={styles.creatingOverlay}>
          <ActivityIndicator color={colors.accent.primary} />
          <Text style={styles.creatingLabel}>Creating channel…</Text>
        </View>
      ) : (
        <TrimmedProductSidebar
          config={codeSidebarConfig}
          onPrimaryAction={(actionId) => {
            void handlePrimaryAction(actionId);
          }}
          onOpenMyLens={() => {
            router.push('/(tabs)/code/my-clowders');
          }}
          onOpenRecents={() => {
            router.push('/(tabs)/code/recents');
          }}
        />
      )}
    </SafeAreaView>
  );
}

function titleForAction(actionId: string): string {
  switch (actionId) {
    case 'new':
      return 'New code';
    case 'team':
      return 'New team code';
    case 'peer':
      return 'New peer code';
    default:
      return 'New code';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
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
