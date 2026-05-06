import { useRef } from 'react';
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import {
  getMobileProductSidebarCopy,
  resolveDefaultMobileLocale,
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
   * actual DELETE network call + refetch — see chat/code/work
   * `index.tsx` and `useDeleteRecent`.
   */
  onDeleteRecent: (channelId: string) => void;
}

type Row =
  | { kind: 'eyebrow'; label: string }
  | { kind: 'primary-actions'; actions: TrimmedSidebarPrimaryAction[] }
  | { kind: 'section-header'; label: string }
  | { kind: 'recent'; entry: MobileSidebarRecent }
  | { kind: 'empty'; label: string; sectionId: string };

function buildRows(
  config: TrimmedSidebarConfig,
  data: TrimmedProductSidebarData,
): Row[] {
  const recentRows: Row[] = data.recents.length > 0
    ? data.recents.map<Row>((entry) => ({ kind: 'recent', entry }))
    : [{
        kind: 'empty' as const,
        label: config.emptyRecentsLabel,
        sectionId: 'recents',
      }];
  return [
    { kind: 'eyebrow', label: config.productLabel },
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
}: TrimmedProductSidebarProps) {
  const rows = buildRows(config, data);
  const sidebarCopy = getMobileProductSidebarCopy(resolveDefaultMobileLocale());

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
          deleteActionLabel: sidebarCopy.deleteAction,
        })
      }
    />
  );
}

function rowKey(row: Row, index: number): string {
  switch (row.kind) {
    case 'eyebrow':
      return 'eyebrow';
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
  deleteActionLabel: string;
}

function renderRow(
  { item }: ListRenderItemInfo<Row>,
  callbacks: RowCallbacks,
) {
  switch (item.kind) {
    case 'eyebrow':
      return (
        <View style={styles.eyebrow}>
          <Text style={styles.eyebrowText}>{item.label}</Text>
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
  onPress: () => void;
  onDelete: () => void;
}

function RecentRow({
  entry,
  deleteActionLabel,
  onPress,
  onDelete,
}: RecentRowProps) {
  // Hold a ref so tapping Delete also closes the swipe (otherwise
  // the red action stays revealed under the row that's about to
  // disappear via refetch — looks janky during the network round
  // trip).
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={deleteActionLabel}
      onPress={() => {
        swipeableRef.current?.close();
        onDelete();
      }}
      style={({ pressed }) => [
        styles.deleteAction,
        pressed ? styles.deleteActionPressed : null,
      ]}
    >
      <Text style={styles.deleteActionLabel}>{deleteActionLabel}</Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          pressed ? styles.rowPressed : null,
        ]}
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
      </Pressable>
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
  eyebrow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  eyebrowText: {
    color: colors.fg.muted,
    ...typography.label,
    letterSpacing: 1.0,
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
  deleteActionLabel: {
    color: colors.fg.inverse,
    ...typography.body,
    fontWeight: '600',
  },
});
