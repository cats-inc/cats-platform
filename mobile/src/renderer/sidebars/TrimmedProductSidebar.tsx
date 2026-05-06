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
}

type Row =
  | { kind: 'tab-title'; label: string }
  | { kind: 'primary-actions'; actions: TrimmedSidebarPrimaryAction[] }
  | { kind: 'section-header'; label: string }
  | { kind: 'recent'; entry: MobileSidebarRecent }
  | { kind: 'empty'; label: string; sectionId: string };

function buildRows(
  config: TrimmedSidebarConfig,
  data: TrimmedProductSidebarData,
  tabTitle: string,
): Row[] {
  const recentRows: Row[] = data.recents.length > 0
    ? data.recents.map<Row>((entry) => ({ kind: 'recent', entry }))
    : [{
        kind: 'empty' as const,
        label: config.emptyRecentsLabel,
        sectionId: 'recents',
      }];
  return [
    { kind: 'tab-title', label: tabTitle },
    { kind: 'primary-actions', actions: [...config.primaryActions] },
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
}: TrimmedProductSidebarProps) {
  const locale = resolveDefaultMobileLocale();
  const sidebarCopy = getMobileProductSidebarCopy(locale);
  const tabsCopy = getMobileTabsCopy(locale);
  // Render the tab's display title (e.g. "Chat" / "聊天") at
  // typography.display so the visual matches the Cats and Settings
  // tabs. The previous "eyebrow" used `productLabel` ('CHAT' /
  // '聊天') in tiny caps which the user reported as "又小又淡".
  const tabTitle = tabsCopy.tabTitle[config.product as MobileProductMode];
  const rows = buildRows(config, data, tabTitle);

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
          isDeletingRecent,
          deleteActionLabel: sidebarCopy.deleteAction,
        })
      }
    />
  );
}

const NEVER_DELETING = (): boolean => false;

function rowKey(row: Row, index: number): string {
  switch (row.kind) {
    case 'tab-title':
      return 'tab-title';
    case 'primary-actions':
      return 'primary-actions';
    case 'section-header':
      return `section:${row.label}`;
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
    paddingVertical: spacing.sm,
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
    paddingHorizontal: spacing.md,
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
    paddingHorizontal: spacing.md,
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
