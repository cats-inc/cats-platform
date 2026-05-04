import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  MobileSidebarCat,
  MobileSidebarCatStatus,
  MobileSidebarRecent,
} from '../../../../src/mobile/index.js';
import { colors, radii, spacing, typography } from '../theme';
import type {
  TrimmedSidebarConfig,
  TrimmedSidebarPrimaryAction,
} from './types';

export interface TrimmedProductSidebarData {
  cats: MobileSidebarCat[];
  recents: MobileSidebarRecent[];
}

export interface TrimmedProductSidebarProps {
  config: TrimmedSidebarConfig;
  data: TrimmedProductSidebarData;
  onPrimaryAction: (actionId: string) => void;
  onSelectCat: (catId: string) => void;
  onSelectRecent: (channelId: string) => void;
}

type Row =
  | { kind: 'eyebrow'; label: string }
  | { kind: 'primary-actions'; actions: TrimmedSidebarPrimaryAction[] }
  | { kind: 'section-header'; label: string }
  | { kind: 'cat'; entry: MobileSidebarCat }
  | { kind: 'recent'; entry: MobileSidebarRecent }
  | { kind: 'empty'; label: string; sectionId: string };

function buildRows(
  config: TrimmedSidebarConfig,
  data: TrimmedProductSidebarData,
): Row[] {
  const catRows: Row[] = data.cats.length > 0
    ? data.cats.map<Row>((entry) => ({ kind: 'cat', entry }))
    : [{
        kind: 'empty' as const,
        label: config.emptyCatsLabel,
        sectionId: 'my-lens',
      }];
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
    { kind: 'section-header', label: config.myLensLabel },
    ...catRows,
    { kind: 'section-header', label: config.recentsLabel },
    ...recentRows,
  ];
}

export function TrimmedProductSidebar({
  config,
  data,
  onPrimaryAction,
  onSelectCat,
  onSelectRecent,
}: TrimmedProductSidebarProps) {
  const rows = buildRows(config, data);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={rowKey}
      renderItem={(info) =>
        renderRow(info, {
          catStatusLabels: config.catStatusLabels,
          onPrimaryAction,
          onSelectCat,
          onSelectRecent,
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
    case 'cat':
      return `cat:${row.entry.id}`;
    case 'recent':
      return `recent:${row.entry.id}`;
    case 'empty':
      return `empty:${row.sectionId}:${index}`;
  }
}

interface RowCallbacks {
  catStatusLabels: Record<MobileSidebarCatStatus, string>;
  onPrimaryAction: (actionId: string) => void;
  onSelectCat: (catId: string) => void;
  onSelectRecent: (channelId: string) => void;
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
    case 'cat':
      return (
        <CatRow
          entry={item.entry}
          statusLabels={callbacks.catStatusLabels}
          onPress={() => callbacks.onSelectCat(item.entry.id)}
        />
      );
    case 'recent':
      return (
        <RecentRow
          entry={item.entry}
          onPress={() => callbacks.onSelectRecent(item.entry.id)}
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

interface CatRowProps {
  entry: MobileSidebarCat;
  statusLabels: Record<MobileSidebarCatStatus, string>;
  onPress: () => void;
}

function CatRow({ entry, statusLabels, onPress }: CatRowProps) {
  const initials = entry.name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase() || entry.name.slice(0, 2).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <View
        style={[
          styles.catAvatar,
          { backgroundColor: entry.avatarColor ?? colors.bubble.mentionDefault },
        ]}
      >
        <Text style={styles.catAvatarText}>{initials}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {entry.name}
        </Text>
        <View style={styles.catStatusInline}>
          <StatusDot status={entry.status} />
          <Text style={styles.catStatusText}>{statusLabels[entry.status]}</Text>
        </View>
      </View>
    </Pressable>
  );
}

interface RecentRowProps {
  entry: MobileSidebarRecent;
  onPress: () => void;
}

function RecentRow({ entry, onPress }: RecentRowProps) {
  return (
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
  );
}

interface StatusDotProps {
  status: MobileSidebarCatStatus;
}

function StatusDot({ status }: StatusDotProps) {
  const dotColor = (() => {
    switch (status) {
      case 'ready':
        return colors.status.readyText;
      case 'warm':
        return colors.status.warmText;
      case 'sleeping':
        return colors.status.mutedText;
    }
  })();
  return <View style={[styles.statusDot, { backgroundColor: dotColor }]} />;
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
  catAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catAvatarText: {
    color: colors.bubble.mentionText,
    ...typography.label,
    fontWeight: '700',
  },
  catStatusInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  catStatusText: {
    color: colors.fg.muted,
    ...typography.caption,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyText: {
    color: colors.fg.muted,
    ...typography.caption,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
});
