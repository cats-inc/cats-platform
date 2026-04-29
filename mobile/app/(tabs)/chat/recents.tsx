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

import { useProductRecents } from '../../../src/renderer/hooks/useProductRecents';
import { colors, spacing, typography } from '../../../src/renderer/theme';

export default function ChatRecentsScreen() {
  const router = useRouter();
  const { state } = useProductRecents('chat');

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Recents (Chat)', headerShown: true }} />
      {state.kind === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : state.kind === 'unconfigured' ? (
        <Panel
          title="Connect to your desktop"
          body="Set the desktop base URL in Settings to load Chat recents."
        />
      ) : state.kind === 'error' ? (
        <Panel title="Could not load recents" body={state.error.message} />
      ) : state.recents.length === 0 ? (
        <Panel
          title="Nothing here yet"
          body="Recent Chat conversations will appear here once you start one."
        />
      ) : (
        <FlatList
          data={state.recents}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(tabs)/chat/${item.id}`)}
              style={({ pressed }) => [
                styles.row,
                pressed ? styles.rowPressed : null,
              ]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                ) : null}
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  rowText: {
    gap: 2,
  },
  rowTitle: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  rowSubtitle: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
});
