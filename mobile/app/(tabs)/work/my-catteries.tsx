import { Stack, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useMyCatsLens } from '../../../src/renderer/hooks/useMyCatsLens';
import { colors, spacing, typography } from '../../../src/renderer/theme';

export default function MyCatteriesScreen() {
  const router = useRouter();
  const { state } = useMyCatsLens('work');

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'My Catteries', headerShown: true }} />
      {state.kind === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : state.kind === 'unconfigured' ? (
        <Panel
          title="Connect to your desktop"
          body="Set the desktop base URL in Settings to load your Work catteries."
        />
      ) : state.kind === 'error' ? (
        <Panel title="Could not load catteries" body={state.error.message} />
      ) : state.cats.length === 0 ? (
        <Panel
          title="No catteries yet"
          body="Create a cat assigned to the Work product on the desktop."
        />
      ) : (
        <FlatList
          data={state.cats}
          keyExtractor={(cat) => cat.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(tabs)/work/direct-${item.id}`)}
              style={({ pressed }) => [
                styles.row,
                pressed ? styles.rowPressed : null,
              ]}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: item.avatarColor ?? colors.bubble.mentionDefault },
                ]}
              >
                <Text style={styles.avatarText}>
                  {item.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowStatus}>{item.status}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

interface PanelProps {
  title: string;
  body: string;
}

function Panel({ title, body }: PanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  panelTitle: {
    color: colors.fg.primary,
    ...typography.title,
  },
  panelBody: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  listContent: {
    paddingVertical: spacing.sm,
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.bubble.mentionText,
    ...typography.label,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  rowStatus: {
    color: colors.fg.muted,
    ...typography.caption,
  },
});
