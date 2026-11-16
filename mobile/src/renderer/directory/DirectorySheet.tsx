import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radii, spacing, typography } from '../theme';

/**
 * Sheets and controls for changing Clowders and Catteries. Built from React
 * Native's own pieces: Desktop serves this bundle to an installed app, so it
 * cannot need a native module the app does not already have.
 */

export function DirectorySheet({
  visible,
  title,
  onClose,
  closeLabel,
  primary,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  closeLabel: string;
  /** A confirming action in the header, such as Save. */
  primary?: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean };
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheetHeader}>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.headerButton}>
            <Text style={styles.headerButtonLabel}>{closeLabel}</Text>
          </Pressable>
          <Text style={styles.sheetTitle} numberOfLines={1}>{title}</Text>
          <View style={[styles.headerButton, styles.headerButtonEnd]}>
            {primary ? (
              primary.busy ? (
                <ActivityIndicator color={colors.accent.primary} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: Boolean(primary.disabled) }}
                  disabled={primary.disabled}
                  onPress={primary.onPress}
                  hitSlop={8}
                >
                  <Text style={[styles.headerButtonLabel, styles.headerPrimary, primary.disabled ? styles.disabled : null]}>
                    {primary.label}
                  </Text>
                </Pressable>
              )
            ) : null}
          </View>
        </View>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetBody}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetSection({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.sectionCard}>{children}</View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SheetField({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.fg.muted}
        {...input}
        style={[styles.input, input.multiline ? styles.inputMultiline : null, error ? styles.inputError : null]}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

/** One choice of a few, like Desktop's segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: Boolean(disabled) }}
            disabled={disabled || selected}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <Text style={[styles.segmentLabel, selected ? styles.segmentLabelSelected : null]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tappable row in a sheet. `tone` marks a destructive one. */
export function SheetAction({
  label,
  detail,
  onPress,
  tone = 'default',
  disabled,
  selected,
  leading,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  tone?: 'default' | 'accent' | 'danger';
  disabled?: boolean;
  /** A checkmark, for a pick from a list. */
  selected?: boolean;
  leading?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(selected) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed ? styles.actionPressed : null]}
    >
      {leading}
      <View style={styles.actionText}>
        <Text
          style={[
            styles.actionLabel,
            tone === 'accent' ? styles.actionAccent : null,
            tone === 'danger' ? styles.actionDanger : null,
            disabled ? styles.disabled : null,
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {detail ? <Text style={styles.actionDetail}>{detail}</Text> : null}
      </View>
      {selected ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

export function SheetError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.sheetError} accessibilityRole="alert">
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  headerButton: {
    minWidth: 72,
    minHeight: 32,
    justifyContent: 'center',
  },
  headerButtonEnd: {
    alignItems: 'flex-end',
  },
  headerButtonLabel: {
    color: colors.accent.primary,
    ...typography.body,
  },
  headerPrimary: {
    fontWeight: '600',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetBody: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.fg.secondary,
    ...typography.label,
    marginLeft: spacing.xs,
  },
  sectionCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.panel,
    overflow: 'hidden',
  },
  hint: {
    color: colors.fg.muted,
    ...typography.caption,
    marginLeft: spacing.xs,
  },
  field: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  fieldLabel: {
    color: colors.fg.secondary,
    ...typography.label,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.fg.primary,
    backgroundColor: colors.bg.panel,
    ...typography.body,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.accent.danger,
  },
  errorText: {
    color: colors.accent.danger,
    ...typography.caption,
  },
  segmented: {
    flexDirection: 'row',
    margin: spacing.md,
    padding: 2,
    borderRadius: radii.md,
    backgroundColor: colors.bg.sidebar,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  segmentSelected: {
    backgroundColor: colors.bg.panel,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentLabel: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  segmentLabelSelected: {
    color: colors.fg.primary,
    fontWeight: '600',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  actionPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  actionText: {
    flex: 1,
    minWidth: 0,
  },
  actionLabel: {
    color: colors.fg.primary,
    ...typography.body,
  },
  actionAccent: {
    color: colors.accent.primary,
  },
  actionDanger: {
    color: colors.accent.danger,
  },
  actionDetail: {
    color: colors.fg.muted,
    ...typography.label,
  },
  check: {
    color: colors.accent.primary,
    ...typography.bodyStrong,
  },
  disabled: {
    opacity: 0.45,
  },
  sheetError: {
    color: colors.accent.danger,
    ...typography.caption,
  },
});
