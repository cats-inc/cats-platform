import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getChatSidebarConfig,
  getMobileDesktopOnlyAlertCopy,
} from '../../../src/api/fixtures/productSidebar';
import { useProductSidebarData } from '../../../src/renderer/hooks/useProductSidebarData';
import { useRecentDeleteHandler } from '../../../src/renderer/hooks/useRecentDeleteHandler';
import { mobileRoutes } from '../../../src/routes';
import { MobileAuthPanel } from '../../../src/renderer/screens/MobileAuthPanel';
import { TrimmedProductSidebar } from '../../../src/renderer/sidebars/TrimmedProductSidebar';
import { colors } from '../../../src/renderer/theme';
import {
  findMobileDirectLaneForCat,
  getMobileProductSidebarCopy,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
  selectMobileChatDirectLaneCats,
  type MobileChatCat,
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
  const { state, refetch } = useProductSidebarData('chat');
  const locale = resolveDefaultMobileLocale();
  const copy = getMobileTabsCopy(locale);
  const sidebarCopy = getMobileProductSidebarCopy(locale);
  const sidebarConfig = getChatSidebarConfig(locale);
  const { onDelete: handleDeleteRecent, isDeleting } = useRecentDeleteHandler();

  // Project the DIRECT MESSAGES section off the same `/api/app-shell`
  // payload the Recents row consumes — sorted via the shared
  // `sortChatCatsByRecency` algorithm. Chat-only; Code / Work omit
  // this section entirely.
  const directLaneCats = useMemo(
    () =>
      state.kind === 'data'
        ? selectMobileChatDirectLaneCats(state.payload)
        : [],
    [state],
  );

  const handleSelectDirectMessageCat = useCallback(
    (catId: string) => {
      if (state.kind !== 'data') {
        return;
      }
      // Existing direct-lane channel → push the user straight
      // there, matching the desktop's `/chat/dm/:catId` deep link
      // target.
      const directLane = findMobileDirectLaneForCat(
        state.payload.chat.channels,
        catId,
      );
      if (directLane) {
        router.push(mobileRoutes.productChannel('chat', directLane.id));
        return;
      }
      // No existing DM yet → navigate to the chat draft route
      // with `entryKind=direct` and the cat preset. Mirrors the
      // desktop's auto-create-on-first-send behaviour:
      // `useDraftChannel` POSTs `/api/channels` with
      // `defaultRecipientId / participantCatIds` so the
      // freshly-created channel arrives wired to this cat.
      const cat = state.payload.chat.cats.find(
        (entry: MobileChatCat) => entry.id === catId,
      );
      if (!cat) {
        return;
      }
      router.push(
        mobileRoutes.productNewDraft('chat', {
          entryKind: 'direct',
          directLane: { catId, catName: cat.name },
        }),
      );
    },
    [router, state],
  );

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
        mobileRoutes.productNewDraft('chat', { entryKind: actionId }),
      );
    },
    [copy, router],
  );

  const handleSelectRecent = useCallback(
    (channelId: string) => {
      router.push(mobileRoutes.productChannel('chat', channelId));
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {state.kind === 'unauthenticated' ? (
        <MobileAuthPanel onAuthenticated={refetch} />
      ) : (
        <TrimmedProductSidebar
          config={sidebarConfig}
          data={{
            recents: state.kind === 'data' ? state.recents : [],
          }}
          onPrimaryAction={handlePrimaryAction}
          onSelectRecent={handleSelectRecent}
          onDeleteRecent={handleDeleteRecent}
          isDeletingRecent={isDeleting}
          directMessages={{
            cats: directLaneCats,
            label: sidebarCopy.directMessagesLabel,
            onSelectCat: handleSelectDirectMessageCat,
          }}
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
});
