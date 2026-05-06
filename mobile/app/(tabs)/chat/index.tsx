import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, SafeAreaView, StyleSheet } from 'react-native';

import {
  getChatSidebarConfig,
  getMobileDesktopOnlyAlertCopy,
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
 * Chat sidebar. Mirrors the web Chat sidebar's tap behaviour: tapping
 * a primary action chip does NOT POST `/api/channels`. It navigates
 * the user into the chat draft route (`/(tabs)/chat/new?entryKind=…`),
 * which mounts an empty `ChatView` in draft mode. The channel is
 * created by `useDraftChannel` only after the user sends their first
 * message — this matches web's `<NewChatDraft>` lifecycle and stops
 * the previous mobile bug where every tap left an empty channel in
 * Recents.
 *
 * `+ Parallel Chat` is still desktop-only on mobile (the create
 * contract has no parallel path), routed through
 * `getMobileDesktopOnlyAlertCopy`.
 */
export default function ChatSidebarScreen() {
  const router = useRouter();
  const { state } = useProductSidebarData('chat');
  const locale = resolveDefaultMobileLocale();
  const copy = getMobileTabsCopy(locale);
  const sidebarConfig = getChatSidebarConfig(locale);
  const { onDelete: handleDeleteRecent, isDeleting } = useRecentDeleteHandler();

  const handlePrimaryAction = useCallback(
    (actionId: string) => {
      const desktopOnly = getMobileDesktopOnlyAlertCopy('chat', actionId, copy);
      if (desktopOnly) {
        Alert.alert(
          desktopOnly.title,
          desktopOnly.body,
          [{ text: copy.desktopOnlyOkAction, style: 'cancel' }],
        );
        return;
      }
      router.push(
        `/(tabs)/chat/new?entryKind=${encodeURIComponent(actionId)}`,
      );
    },
    [copy, router],
  );

  const handleSelectRecent = useCallback(
    (channelId: string) => {
      router.push(`/(tabs)/chat/${channelId}`);
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
