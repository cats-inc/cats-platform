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

import { codeSidebarConfig } from '../../../src/api/fixtures/productSidebar';
import { useCreateChannel } from '../../../src/renderer/hooks/useCreateChannel';
import { useProductSidebarData } from '../../../src/renderer/hooks/useProductSidebarData';
import { TrimmedProductSidebar } from '../../../src/renderer/sidebars/TrimmedProductSidebar';
import { colors, spacing, typography } from '../../../src/renderer/theme';

export default function CodeSidebarScreen() {
  const router = useRouter();
  const createChannel = useCreateChannel();
  const { state } = useProductSidebarData('code');

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

  const handleSelectCat = useCallback(() => {
    Alert.alert(
      'Direct cat chat — desktop only',
      'Tapping a clowder member to start a direct conversation is not yet wired on mobile. Start the direct lane on the desktop; it will appear in RECENTS here once created.',
      [{ text: 'OK', style: 'cancel' }],
    );
  }, []);

  const handleSelectRecent = useCallback(
    (channelId: string) => {
      router.push(`/(tabs)/code/${channelId}`);
    },
    [router],
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
          data={{
            cats: state.kind === 'data' ? state.cats : [],
            recents: state.kind === 'data' ? state.recents : [],
          }}
          onPrimaryAction={(actionId) => {
            void handlePrimaryAction(actionId);
          }}
          onSelectCat={handleSelectCat}
          onSelectRecent={handleSelectRecent}
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
