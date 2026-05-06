import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getCodeSidebarConfig,
  getMobileDesktopOnlyAlertCopy,
} from '../../../src/api/fixtures/productSidebar';
import { useProductSidebarData } from '../../../src/renderer/hooks/useProductSidebarData';
import { useRecentDeleteHandler } from '../../../src/renderer/hooks/useRecentDeleteHandler';
import { mobileRoutes } from '../../../src/routes';
import { TrimmedProductSidebar } from '../../../src/renderer/sidebars/TrimmedProductSidebar';
import { colors } from '../../../src/renderer/theme';
import {
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

/**
 * Code sidebar. See `chat/index.tsx` for the draft-route rationale —
 * tapping a primary action chip navigates to
 * `/(tabs)/code/new?entryKind=…` instead of POSTing `/api/channels`.
 * `+ Peer Code` is desktop-only on mobile (mirrors `+ Parallel Chat`
 * and `+ Parallel Work`), routed through `getMobileDesktopOnlyAlertCopy`.
 */
export default function CodeSidebarScreen() {
  const router = useRouter();
  const { state } = useProductSidebarData('code');
  const locale = resolveDefaultMobileLocale();
  const copy = getMobileTabsCopy(locale);
  const sidebarConfig = getCodeSidebarConfig(locale);
  const { onDelete: handleDeleteRecent, isDeleting } = useRecentDeleteHandler();

  const handlePrimaryAction = useCallback(
    (actionId: string) => {
      const desktopOnly = getMobileDesktopOnlyAlertCopy('code', actionId, copy);
      if (desktopOnly) {
        Alert.alert(
          desktopOnly.title,
          desktopOnly.body,
          [{ text: copy.desktopOnlyOkAction, style: 'cancel' }],
        );
        return;
      }
      router.push(
        mobileRoutes.productNewDraft('code', { entryKind: actionId }),
      );
    },
    [copy, router],
  );

  const handleSelectRecent = useCallback(
    (channelId: string) => {
      router.push(mobileRoutes.productChannel('code', channelId));
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
