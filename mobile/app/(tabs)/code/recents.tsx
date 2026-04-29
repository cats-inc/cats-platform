import { Stack } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../../src/renderer/theme';

export default function CodeRecentsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Recents (Code)', headerShown: true }} />
      <View style={styles.body}>
        <Text style={styles.title}>Recents</Text>
        <Text style={styles.subtitle}>Code-scoped recents.</Text>
        <Text style={styles.empty}>Nothing here yet.</Text>
        {__DEV__ ? (
          <Text style={styles.devNote}>
            Product-scoped recents (per SPEC-070) land alongside Phase 4b
            live data. Until then this screen is a placeholder destination.
          </Text>
        ) : null}
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
  empty: {
    color: colors.fg.muted,
    ...typography.body,
    marginTop: spacing.lg,
  },
  devNote: {
    color: colors.fg.muted,
    ...typography.label,
    marginTop: spacing.md,
  },
});
