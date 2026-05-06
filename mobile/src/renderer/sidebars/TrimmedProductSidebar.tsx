import { useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { TouchableOpacity } from 'react-native-gesture-handler';

import {
  getMobileProductSidebarCopy,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
  type MobileChatCat,
  type MobileProductMode,
  type MobileSidebarRecent,
} from '../../../../src/mobile/index.js';
import { colors, radii, spacing, typography } from '../theme';
import type {
  TrimmedSidebarConfig,
  TrimmedSidebarPrimaryAction,
} from './types';

export interface TrimmedProductSidebarData {
  recents: MobileSidebarRecent[];
}

/**
 * DIRECT MESSAGES section input. Optional — only the Chat tab
 * passes this today; Code / Work omit it. The list is the cats to
 * render (already sorted via `selectMobileChatDirectLaneCats` in
 * the parent), the label is the localized section header, and
 * `onSelectCat` fires when the user taps a row.
 */
export interface TrimmedProductSidebarDirectMessages {
  cats: readonly MobileChatCat[];
  label: string;
  onSelectCat: (catId: string) => void;
}

export interface TrimmedProductSidebarProps {
  config: TrimmedSidebarConfig;
  data: TrimmedProductSidebarData;
  onPrimaryAction: (actionId: string) => void;
  onSelectRecent: (channelId: string) => void;
  /**
   * Fires when the user swipes a Recents row left and taps the
   * revealed Delete button. The handler is responsible for the
   * actual DELETE network call — see chat/code/work `index.tsx`
   * and `useRecentDeleteHandler`.
   */
  onDeleteRecent: (channelId: string) => void;
  /**
   * True while a DELETE on this channelId is still in flight.
   * Drives the per-row spinner + button-disabled state inside
   * `Swipeable`'s revealed action so the user gets feedback that
   * the tap registered and can't fire duplicate DELETEs by
   * tapping again. Defaults to `() => false` if the parent has
   * no in-flight tracking.
   */
  isDeletingRecent?: (channelId: string) => boolean;
  /**
   * Optional DIRECT MESSAGES section (rendered above RECENTS).
   * Currently only the Chat tab passes this; Code / Work omit it
   * so they only get primary actions + Recents.
   */
  directMessages?: TrimmedProductSidebarDirectMessages;
}

type Row =
  | { kind: 'tab-title'; label: string }
  | { kind: 'primary-actions'; actions: TrimmedSidebarPrimaryAction[] }
  | { kind: 'section-header'; label: string }
  | { kind: 'dm-cat'; cat: MobileChatCat }
  | { kind: 'recent'; entry: MobileSidebarRecent }
  | { kind: 'empty'; label: string; sectionId: string };

function buildRows(
  config: TrimmedSidebarConfig,
  data: TrimmedProductSidebarData,
  tabTitle: string,
  directMessages: TrimmedProductSidebarDirectMessages | undefined,
): Row[] {
  const recentRows: Row[] = data.recents.length > 0
    ? data.recents.map<Row>((entry) => ({ kind: 'recent', entry }))
    : [{
        kind: 'empty' as const,
        label: config.emptyRecentsLabel,
        sectionId: 'recents',
      }];
  // Only render the DIRECT MESSAGES section header when there's
  // at least one cat to show. Earlier the prop's mere presence
  // forced the header to render — flagged on review because
  // `chat/index.tsx` always passes `directMessages`, so the
  // header showed up on the loading / unconfigured / no-chat-cats
  // states with an empty body underneath.
  const dmRows: Row[] = directMessages && directMessages.cats.length > 0
    ? [
        { kind: 'section-header', label: directMessages.label },
        ...directMessages.cats.map<Row>((cat) => ({ kind: 'dm-cat', cat })),
      ]
    : [];
  return [
    { kind: 'tab-title', label: tabTitle },
    { kind: 'primary-actions', actions: [...config.primaryActions] },
    ...dmRows,
    { kind: 'section-header', label: config.recentsLabel },
    ...recentRows,
  ];
}

export function TrimmedProductSidebar({
  config,
  data,
  onPrimaryAction,
  onSelectRecent,
  onDeleteRecent,
  isDeletingRecent = NEVER_DELETING,
  directMessages,
}: TrimmedProductSidebarProps) {
  const locale = resolveDefaultMobileLocale();
  const sidebarCopy = getMobileProductSidebarCopy(locale);
  const tabsCopy = getMobileTabsCopy(locale);
  // Render the tab's display title (e.g. "Chat" / "聊天") at
  // typography.display so the visual matches the Cats and Settings
  // tabs. The previous "eyebrow" used `productLabel` ('CHAT' /
  // '聊天') in tiny caps which the user reported as "又小又淡".
  const tabTitle = tabsCopy.tabTitle[config.product as MobileProductMode];
  const rows = buildRows(config, data, tabTitle, directMessages);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={rowKey}
      renderItem={(info) =>
        renderRow(info, {
          onPrimaryAction,
          onSelectRecent,
          onDeleteRecent,
          onSelectDirectMessageCat: directMessages?.onSelectCat ?? NEVER_SELECTING_CAT,
          isDeletingRecent,
          deleteActionLabel: sidebarCopy.deleteAction,
        })
      }
    />
  );
}

const NEVER_DELETING = (): boolean => false;
const NEVER_SELECTING_CAT = (): void => undefined;

function rowKey(row: Row, index: number): string {
  switch (row.kind) {
    case 'tab-title':
      return 'tab-title';
    case 'primary-actions':
      return 'primary-actions';
    case 'section-header':
      return `section:${row.label}`;
    case 'dm-cat':
      return `dm-cat:${row.cat.id}`;
    case 'recent':
      return `recent:${row.entry.id}`;
    case 'empty':
      return `empty:${row.sectionId}:${index}`;
  }
}

interface RowCallbacks {
  onPrimaryAction: (actionId: string) => void;
  onSelectRecent: (channelId: string) => void;
  onDeleteRecent: (channelId: string) => void;
  onSelectDirectMessageCat: (catId: string) => void;
  isDeletingRecent: (channelId: string) => boolean;
  deleteActionLabel: string;
}

function renderRow(
  { item }: ListRenderItemInfo<Row>,
  callbacks: RowCallbacks,
) {
  switch (item.kind) {
    case 'tab-title':
      return (
        <View style={styles.tabTitle}>
          <Text style={styles.tabTitleText}>{item.label}</Text>
        </View>
      );
    case 'primary-actions':
      return (
        <View style={styles.primaryActions}>
          {item.actions.map((action) => (
            <PrimaryActionButton
              key={action.id}
              action={action}
              onPress={() => callbacks.onPrimaryAction(action.id)}
            />
          ))}
        </View>
      );
    case 'section-header':
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
        </View>
      );
    case 'dm-cat':
      return (
        <DirectMessageCatRow
          cat={item.cat}
          onPress={() => callbacks.onSelectDirectMessageCat(item.cat.id)}
        />
      );
    case 'recent':
      return (
        <RecentRow
          entry={item.entry}
          deleteActionLabel={callbacks.deleteActionLabel}
          isDeleting={callbacks.isDeletingRecent(item.entry.id)}
          onPress={() => callbacks.onSelectRecent(item.entry.id)}
          onDelete={() => callbacks.onDeleteRecent(item.entry.id)}
        />
      );
    case 'empty':
      return <Text style={styles.emptyText}>{item.label}</Text>;
    default:
      return null;
  }
}

interface PrimaryActionButtonProps {
  action: TrimmedSidebarPrimaryAction;
  onPress: () => void;
}

function PrimaryActionButton({ action, onPress }: PrimaryActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryActionButton,
        pressed ? styles.primaryActionButtonPressed : null,
      ]}
    >
      <Text style={styles.primaryActionLabel}>{action.label}</Text>
    </Pressable>
  );
}

interface DirectMessageCatRowProps {
  cat: MobileChatCat;
  onPress: () => void;
}

function DirectMessageCatRow({ cat, onPress }: DirectMessageCatRowProps) {
  // Avatar bubble + name layout. Mirrors the Cats Directory cat
  // row shape so the visual stays consistent across surfaces. No
  // swipe action here yet — DMs don't have a delete-row shortcut
  // (the desktop archives the cat from /settings/cats; mobile
  // routes a no-op tap to a desktop-only alert when no channel
  // exists yet).
  const initial = cat.name.slice(0, 1).toUpperCase();
  const fallbackColor = cat.avatarColor ?? colors.bubble.mentionDefault;
  return (
    <TouchableOpacity
      accessibilityRole="link"
      accessibilityLabel={cat.name}
      onPress={onPress}
      activeOpacity={0.6}
      style={styles.row}
    >
      <View style={[styles.dmAvatar, { backgroundColor: fallbackColor }]}>
        <Text style={styles.dmAvatarInitial}>{initial}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {cat.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

interface RecentRowProps {
  entry: MobileSidebarRecent;
  deleteActionLabel: string;
  isDeleting: boolean;
  onPress: () => void;
  onDelete: () => void;
}

function RecentRow({
  entry,
  deleteActionLabel,
  isDeleting,
  onPress,
  onDelete,
}: RecentRowProps) {
  // Keep a ref to the Swipeable so tapping the row body (when no
  // delete is in flight) closes any leftover swipe state.
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={deleteActionLabel}
      accessibilityState={{ busy: isDeleting, disabled: isDeleting }}
      disabled={isDeleting}
      // Don't auto-close on tap — leave the action revealed so the
      // spinner is visible during the network round trip. The row
      // unmounts when the SSE-driven refetch removes the channel
      // from the data, which destroys the Swipeable container
      // alongside it.
      onPress={onDelete}
      style={({ pressed }) => [
        styles.deleteAction,
        pressed && !isDeleting ? styles.deleteActionPressed : null,
        isDeleting ? styles.deleteActionBusy : null,
      ]}
    >
      {isDeleting ? (
        <ActivityIndicator color={colors.fg.inverse} size="small" />
      ) : (
        <Text style={styles.deleteActionLabel}>{deleteActionLabel}</Text>
      )}
    </Pressable>
  );

  // The row body is `TouchableOpacity` from
  // `react-native-gesture-handler` (NOT the RN one). Reason: RN's
  // Pressable / TouchableOpacity use the React Native responder
  // system, which doesn't coordinate cleanly with gesture-handler's
  // Swipeable PanGestureHandler — RN catches the touch, fires
  // onPress, and the horizontal pan never reaches Swipeable. Both
  // touchables coming from the same gesture system means pan vs tap
  // negotiates correctly: a horizontal drag activates Swipeable,
  // a tap-up without movement fires onPress.
  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
      // Don't allow a fresh swipe to close while a delete is in
      // flight — keeps the spinner visible until the refetch
      // resolves.
      enabled={!isDeleting}
    >
      <TouchableOpacity
        onPress={onPress}
        // Disable row tap while the Delete is in flight so the user
        // can't accidentally navigate into a channel that's about
        // to disappear.
        disabled={isDeleting}
        activeOpacity={0.6}
        style={[styles.row, isDeleting ? styles.rowBusy : null]}
      >
        <View style={styles.recentIconBubble}>
          <Text style={styles.recentIconBubbleText}>💬</Text>
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {entry.title}
          </Text>
          {entry.subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {entry.subtitle}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  listContent: {
    // Don't add paddingTop here — `tabTitle.paddingTop = spacing.lg`
    // owns the top space, matching the Cats / Settings ScrollView
    // pattern (`content.padding = spacing.lg`). Earlier
    // `paddingVertical: spacing.sm` shifted the title 8 px lower
    // than the Cats / Settings titles, which the user noticed as
    // "tab間切來切去就看到他們在飄動". Keep an explicit
    // `paddingBottom` so the last row has a comfortable bottom
    // gutter — the previous `paddingVertical` was doing that on
    // the bottom side, just clobbering the top alignment in the
    // process.
    paddingBottom: spacing.lg,
  },
  tabTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  tabTitleText: {
    color: colors.fg.primary,
    ...typography.display,
  },
  primaryActions: {
    // Match the Cats / Settings ScrollView `padding: spacing.lg`
    // so primary-action buttons line up with the title and with
    // section panels on the other tabs.
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  primaryActionButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.bg.panel,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  primaryActionButtonPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  primaryActionLabel: {
    color: colors.fg.primary,
    ...typography.body,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionHeaderText: {
    color: colors.fg.muted,
    ...typography.label,
    letterSpacing: 1.0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  rowSubtitle: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  recentIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.panel,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmAvatarInitial: {
    color: colors.bubble.mentionText,
    ...typography.bodyStrong,
  },
  recentIconBubbleText: {
    fontSize: 16,
    lineHeight: 20,
  },
  emptyText: {
    color: colors.fg.muted,
    ...typography.caption,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  deleteAction: {
    backgroundColor: colors.accent.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    minWidth: 88,
  },
  deleteActionPressed: {
    opacity: 0.85,
  },
  deleteActionBusy: {
    opacity: 0.75,
  },
  deleteActionLabel: {
    color: colors.fg.inverse,
    ...typography.body,
    fontWeight: '600',
  },
  rowBusy: {
    opacity: 0.6,
  },
});
