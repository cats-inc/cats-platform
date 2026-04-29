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
});
