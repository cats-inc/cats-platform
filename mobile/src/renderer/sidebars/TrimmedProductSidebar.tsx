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
  TrimmedSidebarCallbacks,
  TrimmedSidebarConfig,
  TrimmedSidebarPrimaryAction,
} from './types';

export interface TrimmedProductSidebarProps extends TrimmedSidebarCallbacks {
  config: TrimmedSidebarConfig;
}

type Row =
  | { kind: 'eyebrow'; label: string }
  | { kind: 'primary-actions'; actions: TrimmedSidebarPrimaryAction[] }
  | { kind: 'nav-row'; key: 'my-lens' | 'recents'; label: string };

function buildRows(config: TrimmedSidebarConfig): Row[] {
  return [
    { kind: 'eyebrow', label: config.productLabel },
    { kind: 'primary-actions', actions: [...config.primaryActions] },
    { kind: 'nav-row', key: 'my-lens', label: config.myLensLabel },
    { kind: 'nav-row', key: 'recents', label: config.recentsLabel },
  ];
}

export function TrimmedProductSidebar({
  config,
  ...callbacks
}: TrimmedProductSidebarProps) {
  const rows = buildRows(config);

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
    case 'eyebrow':
      return 'eyebrow';
    case 'primary-actions':
      return 'primary-actions';
    case 'nav-row':
      return `nav:${row.key}`;
    default:
      return `row:${index}`;
  }
}

function renderRow(
  { item, index }: ListRenderItemInfo<Row>,
  callbacks: TrimmedSidebarCallbacks,
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
    case 'nav-row':
      return (
        <NavRow
          label={item.label}
          onPress={
            item.key === 'my-lens' ? callbacks.onOpenMyLens : callbacks.onOpenRecents
          }
        />
      );
    default:
      return null;
  }
  void index;
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

interface NavRowProps {
  label: string;
  onPress: () => void;
}

function NavRow({ label, onPress }: NavRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navRow,
        pressed ? styles.navRowPressed : null,
      ]}
    >
      <Text style={styles.navRowLabel}>{label}</Text>
      <Text style={styles.navRowChevron}>›</Text>
    </Pressable>
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  navRowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  navRowLabel: {
    color: colors.fg.primary,
    ...typography.body,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  navRowChevron: {
    color: colors.fg.muted,
    fontSize: 22,
    lineHeight: 22,
  },
});
