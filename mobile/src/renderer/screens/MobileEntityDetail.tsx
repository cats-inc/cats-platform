import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getMobileCatsTabCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';
import { colors, radii, spacing, typography } from '../theme';

export type MobileEntityKind = 'cat' | 'clowder' | 'cattery';

type EntityDetailTitleKey =
  | 'entityDetailTitleCat'
  | 'entityDetailTitleClowder'
  | 'entityDetailTitleCattery';

const TITLE_BY_KIND: Record<MobileEntityKind, EntityDetailTitleKey> = {
  cat: 'entityDetailTitleCat',
  clowder: 'entityDetailTitleClowder',
  cattery: 'entityDetailTitleCattery',
};

export interface MobileEntityDetailProps {
  kind: MobileEntityKind;
  id: string;
}

export function MobileEntityDetail({ kind, id }: MobileEntityDetailProps) {
  const router = useRouter();
  const copy = getMobileCatsTabCopy(resolveDefaultMobileLocale());
  const title = copy[TITLE_BY_KIND[kind]];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{copy.entityDetailEyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.body}>{copy.entityDetailBody}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{copy.entityDetailIdLabel}</Text>
        <Text style={styles.metaValue}>{id}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/(tabs)/cats')}
        style={({ pressed }) => [
          styles.backButton,
          pressed ? styles.backButtonPressed : null,
        ]}
      >
        <Text style={styles.backButtonLabel}>{copy.entityDetailBackToDirectoryLabel}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.fg.muted,
    ...typography.label,
    letterSpacing: 0.6,
  },
  title: {
    color: colors.fg.primary,
    ...typography.display,
  },
  body: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  metaLabel: {
    color: colors.fg.muted,
    ...typography.label,
  },
  metaValue: {
    color: colors.fg.primary,
    ...typography.body,
    flexShrink: 1,
  },
  backButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.bg.panel,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignSelf: 'flex-start',
  },
  backButtonPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  backButtonLabel: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
});
