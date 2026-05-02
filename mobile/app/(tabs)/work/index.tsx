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

import { workSidebarConfig } from '../../../src/api/fixtures/productSidebar';
import { useCreateChannel } from '../../../src/renderer/hooks/useCreateChannel';
import { useProductSidebarData } from '../../../src/renderer/hooks/useProductSidebarData';
import { TrimmedProductSidebar } from '../../../src/renderer/sidebars/TrimmedProductSidebar';
import { colors, spacing, typography } from '../../../src/renderer/theme';
import {
  getMobileChannelTitle,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

export default function WorkSidebarScreen() {
  const router = useRouter();
  const createChannel = useCreateChannel();
  const { state } = useProductSidebarData('work');
  const copy = getMobileTabsCopy(resolveDefaultMobileLocale());

  const handlePrimaryAction = useCallback(
    async (actionId: string) => {
      try {
        const channelId = await createChannel.create({
          title: getMobileChannelTitle(copy, 'work', actionId),
          topic: '',
          originSurface: 'work',
          entryKind: actionId === 'team' ? 'group' : 'solo',
        });
        router.push(`/(tabs)/work/${channelId}`);
      } catch {
        // hook state already carries the error; banner renders.
      }
    },
    [copy, createChannel, router],
  );

  const handleSelectCat = useCallback(() => {
    Alert.alert(
      copy.directCatDesktopOnlyTitle,
      copy.directCatDesktopOnlyBody.work,
      [{ text: copy.desktopOnlyOkAction, style: 'cancel' }],
    );
  }, [copy]);

  const handleSelectRecent = useCallback(
    (channelId: string) => {
      router.push(`/(tabs)/work/${channelId}`);
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.container}>
      {createChannel.state.kind === 'error' ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText} numberOfLines={2}>
            {copy.createChannelError(createChannel.state.error.message)}
          </Text>
          <Pressable onPress={createChannel.reset}>
            <Text style={styles.errorBannerDismiss}>{copy.dismissAction}</Text>
          </Pressable>
        </View>
      ) : null}
      {createChannel.state.kind === 'creating' ? (
        <View style={styles.creatingOverlay}>
          <ActivityIndicator color={colors.accent.primary} />
          <Text style={styles.creatingLabel}>{copy.creatingChannelLabel}</Text>
        </View>
      ) : (
        <TrimmedProductSidebar
          config={workSidebarConfig}
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
