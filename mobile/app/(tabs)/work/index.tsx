import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, SafeAreaView, StyleSheet } from 'react-native';

import {
  getMobileDesktopOnlyAlertCopy,
  getWorkSidebarConfig,
} from '../../../src/api/fixtures/productSidebar';
import { useProductSidebarData } from '../../../src/renderer/hooks/useProductSidebarData';
import { useRecentDeleteHandler } from '../../../src/renderer/hooks/useRecentDeleteHandler';
import { TrimmedProductSidebar } from '../../../src/renderer/sidebars/TrimmedProductSidebar';
import { colors } from '../../../src/renderer/theme';
import {
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

/**
 * Work sidebar. See `chat/index.tsx` for the draft-route rationale —
 * tapping a primary action chip navigates to
 * `/(tabs)/work/new?entryKind=…` instead of POSTing `/api/channels`.
 * `+ Parallel Work` is desktop-only on mobile (mirrors
 * `+ Parallel Chat`), routed through `getMobileDesktopOnlyAlertCopy`.
 */
export default function WorkSidebarScreen() {
  const router = useRouter();
  const { state } = useProductSidebarData('work');
  const locale = resolveDefaultMobileLocale();
  const copy = getMobileTabsCopy(locale);
  const sidebarConfig = getWorkSidebarConfig(locale);
  const { onDelete: handleDeleteRecent, isDeleting } = useRecentDeleteHandler();

  const handlePrimaryAction = useCallback(
    (actionId: string) => {
      const desktopOnly = getMobileDesktopOnlyAlertCopy('work', actionId, copy);
      if (desktopOnly) {
        Alert.alert(
          desktopOnly.title,
          desktopOnly.body,
          [{ text: copy.desktopOnlyOkAction, style: 'cancel' }],
        );
        return;
      }
      router.push(
        `/(tabs)/work/new?entryKind=${encodeURIComponent(actionId)}`,
      );
    },
    [copy, router],
  );

  const handleSelectRecent = useCallback(
    (channelId: string) => {
      router.push(`/(tabs)/work/${channelId}`);
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.container}>
      <TrimmedProductSidebar
        config={sidebarConfig}
        data={{
          recents: state.kind === 'data' ? state.recents : [],
        }}
        onPrimaryAction={handlePrimaryAction}
        onSelectRecent={handleSelectRecent}
        onDeleteRecent={handleDeleteRecent}
        isDeletingRecent={isDeleting}
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
