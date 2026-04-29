import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../../src/renderer/theme';

export default function ChatViewStubScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Chat', headerShown: true }} />
      <View style={styles.body}>
        <Text style={styles.title}>ChatView (stub)</Text>
        <Text style={styles.subtitle}>productMode: chat</Text>
        <Text style={styles.subtitle}>
          channelId: {typeof channelId === 'string' ? channelId : '—'}
        </Text>
        <Text style={styles.placeholder}>
          The shared mobile ChatView lands in PLAN-084 Phase 4. For now this
          screen confirms that tapping a Recents entry or a primary action in
          the Chat sidebar pushes through with the correct channel id.
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
