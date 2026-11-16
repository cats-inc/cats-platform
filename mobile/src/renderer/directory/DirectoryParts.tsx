import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MobileMembershipStatus } from '../../../../src/mobile/index.js';
import { colors, radii, spacing, typography } from '../theme';

/**
 * Pieces the Directory screens share. Groups are rounded squares and Cats
 * are circles, as on Desktop; the tints are the Desktop sidebar's: green
 * for Clowders, blue for Catteries.
 */

export const directoryTint = {
  clowder: { bg: '#D7E7D9', fg: '#24583A' },
  cattery: { bg: '#DCE3F5', fg: '#2F4A8C' },
} as const;

export function GroupAvatar({
  name,
  kind,
  size = 'small',
}: {
  name: string;
  kind: 'clowder' | 'cattery';
  size?: 'small' | 'large';
}) {
  const large = size === 'large';
  return (
    <View
      style={[
        styles.groupAvatar,
        large ? styles.groupAvatarLarge : null,
        { backgroundColor: directoryTint[kind].bg },
      ]}
    >
      <Text
        style={[large ? styles.groupInitialLarge : styles.groupInitial, { color: directoryTint[kind].fg }]}
        numberOfLines={1}
      >
        {name.trim().slice(0, 1)}
      </Text>
    </View>
  );
}

export function CatAvatar({ name, color }: { name: string; color: string | null }) {
  return (
    <View style={[styles.catAvatar, color ? { backgroundColor: color } : null]}>
      <Text style={styles.catInitial} numberOfLines={1}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

/** A non-formal status. A passed end date stays visible (SPEC-103 FR-23). */
export function StatusChip({
  status,
  label,
  ended,
}: {
  status: MobileMembershipStatus;
  label: string;
  ended: boolean;
}) {
  const tone = ended ? styles.chipEnded : status === 'temp' ? styles.chipTemp : styles.chipExternal;
  const text = ended ? styles.chipEndedText : status === 'temp' ? styles.chipTempText : styles.chipExternalText;
  return (
    <View style={[styles.chip, tone]}>
      <Text style={[styles.chipText, text]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A whole-screen message: not configured, not found, or a failed read. */
export function DirectoryMessage({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageTitle}>{title}</Text>
      {body ? <Text style={styles.messageBody}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.messageButton, pressed ? styles.pressedDim : null]}
        >
          <Text style={styles.messageButtonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  groupAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 18,
  },
  groupInitial: {
    ...typography.label,
  },
  groupInitialLarge: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
  },
  catAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#8B7E74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catInitial: {
    color: '#fff',
    ...typography.label,
  },
  chip: {
    flexShrink: 1,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipText: {
    ...typography.label,
  },
  chipTemp: {
    backgroundColor: colors.status.warmBg,
    borderColor: 'rgba(141, 104, 48, 0.45)',
    borderStyle: 'dashed',
  },
  chipTempText: {
    color: colors.status.warmText,
  },
  chipEnded: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(192, 57, 43, 0.45)',
    borderStyle: 'dashed',
  },
  chipEndedText: {
    color: colors.accent.danger,
  },
  chipExternal: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(47, 74, 140, 0.4)',
  },
  chipExternalText: {
    color: directoryTint.cattery.fg,
  },
  message: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  messageTitle: {
    color: colors.fg.primary,
    ...typography.title,
  },
  messageBody: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  messageButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.accent.primary,
    marginTop: spacing.sm,
  },
  messageButtonLabel: {
    color: colors.fg.inverse,
    ...typography.bodyStrong,
  },
  pressedDim: {
    opacity: 0.85,
  },
});
