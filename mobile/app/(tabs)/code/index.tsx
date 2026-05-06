import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';

import { getCodeSidebarConfig } from '../../../src/api/fixtures/productSidebar';
import { useProductSidebarData } from '../../../src/renderer/hooks/useProductSidebarData';
import { TrimmedProductSidebar } from '../../../src/renderer/sidebars/TrimmedProductSidebar';
import { colors } from '../../../src/renderer/theme';
import { resolveDefaultMobileLocale } from '../../../../src/mobile/index.js';

/**
 * Code sidebar. See `chat/index.tsx` for the draft-route rationale —
 * tapping a primary action chip navigates to
 * `/(tabs)/code/new?entryKind=…` instead of POSTing `/api/channels`.
 * Code has no desktop-only chip today, so every chip routes into the
 * draft.
 */
export default function CodeSidebarScreen() {
  const router = useRouter();
  const { state } = useProductSidebarData('code');
  const locale = resolveDefaultMobileLocale();
  const sidebarConfig = getCodeSidebarConfig(locale);

  const handlePrimaryAction = useCallback(
    (actionId: string) => {
      router.push(
        `/(tabs)/code/new?entryKind=${encodeURIComponent(actionId)}`,
      );
    },
    [router],
  );

  const handleSelectRecent = useCallback(
    (channelId: string) => {
      router.push(`/(tabs)/code/${channelId}`);
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
