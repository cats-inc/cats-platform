import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import type {
  ChatSidebarCallbacks,
  ChatSidebarData,
  SidebarCatEntry,
  SidebarCatStatus,
  SidebarRecentEntry,
} from './types';

export interface ChatSidebarProps extends ChatSidebarCallbacks {
  data: ChatSidebarData;
}

type Row =
  | { kind: 'primary-actions' }
  | { kind: 'section-header'; label: string; trailing?: 'add-cat' }
  | { kind: 'recent'; entry: SidebarRecentEntry }
  | { kind: 'cat'; entry: SidebarCatEntry }
  | { kind: 'empty'; label: string };

function buildRows(data: ChatSidebarData): Row[] {
  const recentsSection: Row[] = [
    { kind: 'section-header', label: 'Recents' },
    ...(data.recents.length > 0
      ? data.recents.map<Row>((entry) => ({ kind: 'recent', entry }))
      : [{ kind: 'empty' as const, label: 'No recent chats yet.' }]),
  ];
  const catsSection: Row[] = [
    { kind: 'section-header', label: 'My cats', trailing: 'add-cat' },
    ...(data.cats.length > 0
      ? data.cats.map<Row>((entry) => ({ kind: 'cat', entry }))
      : [{ kind: 'empty' as const, label: 'No cats yet.' }]),
  ];
  return [{ kind: 'primary-actions' }, ...recentsSection, ...catsSection];
}

export function ChatSidebar({ data, ...callbacks }: ChatSidebarProps) {
  const rows = buildRows(data);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={rowKey}
      renderItem={(info) => renderRow(info, callbacks)}
    />
  );
}

function rowKey(row: Row, index: number): string {
  switch (row.kind) {
    case 'primary-actions':
      return 'primary-actions';
    case 'section-header':
      return `section:${row.label}`;
    case 'recent':
      return `recent:${row.entry.id}`;
    case 'cat':
      return `cat:${row.entry.id}`;
    case 'empty':
      return `empty:${index}`;
  }
}

function renderRow(
  { item, index }: ListRenderItemInfo<Row>,
  callbacks: ChatSidebarCallbacks,
) {
  switch (item.kind) {
    case 'primary-actions':
      return <PrimaryActions callbacks={callbacks} />;
    case 'section-header':
      return (
        <SectionHeader
          label={item.label}
          trailing={item.trailing}
          onAddCat={callbacks.onCreateNewCat}
        />
      );
    case 'recent':
      return (
        <RecentRow
          entry={item.entry}
          onPress={() => callbacks.onSelectRecent(item.entry.id)}
        />
      );
    case 'cat':
      return (
        <CatRow
          entry={item.entry}
          onPress={() => callbacks.onSelectCat(item.entry.id)}
        />
      );
    case 'empty':
      return <Text style={styles.emptyText}>{item.label}</Text>;
    default:
      return null;
  }
  // The exhaustive switch covers all Row kinds; index is ignored on
  // purpose so the row component never depends on its position.
  void index;
}

interface PrimaryActionsProps {
  callbacks: ChatSidebarCallbacks;
}

function PrimaryActions({ callbacks }: PrimaryActionsProps) {
  return (
    <View style={styles.primaryActions}>
      <PrimaryActionButton label="+ New chat" onPress={callbacks.onStartNewChat} />
      <PrimaryActionButton
        label="+ Group chat"
        onPress={callbacks.onStartNewGroupChat}
      />
      <PrimaryActionButton
        label="+ Parallel chat"
        onPress={callbacks.onStartNewParallelChat}
      />
    </View>
  );
}

interface PrimaryActionButtonProps {
  label: string;
  onPress: () => void;
}

function PrimaryActionButton({ label, onPress }: PrimaryActionButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryActionButton,
        pressed ? styles.primaryActionButtonPressed : null,
      ]}
      onPress={onPress}
    >
      <Text style={styles.primaryActionLabel}>{label}</Text>
    </Pressable>
  );
}

interface SectionHeaderProps {
  label: string;
  trailing?: 'add-cat';
  onAddCat: () => void;
}

function SectionHeader({ label, trailing, onAddCat }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{label.toUpperCase()}</Text>
      {trailing === 'add-cat' ? (
        <Pressable onPress={onAddCat}>
          <Text style={styles.sectionHeaderAction}>+ New cat</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface RecentRowProps {
  entry: SidebarRecentEntry;
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

interface CatRowProps {
  entry: SidebarCatEntry;
  onPress: () => void;
}

function CatRow({ entry, onPress }: CatRowProps) {
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
          <Text style={styles.catStatusText}>{statusLabel(entry.status)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

interface StatusDotProps {
  status: SidebarCatStatus;
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

function statusLabel(status: SidebarCatStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'warm':
      return 'Warm';
    case 'sleeping':
      return 'Sleeping';
  }
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  primaryActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  primaryActionButton: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bg.panel,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
  },
  primaryActionButtonPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  primaryActionLabel: {
    color: colors.fg.primary,
    ...typography.label,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: {
    color: colors.fg.muted,
    ...typography.label,
    letterSpacing: 0.6,
  },
  sectionHeaderAction: {
    color: colors.accent.primary,
    ...typography.label,
    fontWeight: '600',
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
