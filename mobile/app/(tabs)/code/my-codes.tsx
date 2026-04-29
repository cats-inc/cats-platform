import { Stack } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../../src/renderer/theme';

export default function MyCodesScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'My Codes', headerShown: true }} />
      <View style={styles.body}>
        <Text style={styles.title}>MY CODES</Text>
        <Text style={styles.subtitle}>The Code lens of MY CATS.</Text>
        <Text style={styles.placeholder}>
          MY CATS lens projections (FR-046, FR-047) land in PLAN-084 Phase 6
          alongside the Lobby and Settings tab content.
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
