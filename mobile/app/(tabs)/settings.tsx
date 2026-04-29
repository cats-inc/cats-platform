import { Link } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../src/renderer/theme';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Connection, notifications, owner, deep link to web.
        </Text>
        <Text style={styles.placeholder}>
          Settings content lands in PLAN-084 Phase 6.
        </Text>
        <View style={styles.devSection}>
          <Text style={styles.devLabel}>Developer tools</Text>
          <Link href="/bubble-harness" style={styles.devLink}>
            Bubble visual gate (PLAN-084 Phase 2)
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.fg.primary,
    ...typography.display,
  },
  subtitle: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  placeholder: {
    color: colors.fg.muted,
    ...typography.caption,
    marginTop: spacing.md,
  },
  devSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    gap: spacing.xs,
  },
  devLabel: {
    color: colors.fg.muted,
    ...typography.label,
  },
  devLink: {
    color: colors.accent.primary,
    ...typography.body,
  },
});
