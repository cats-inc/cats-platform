import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { lobbyFixture } from '../../api/fixtures/lobby';
import type { LobbyActivityEntry } from '../../api/fixtures/lobby';
import { colors, radii, spacing, typography } from '../theme';

export function Lobby() {
  const router = useRouter();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{lobbyFixture.todayLabel}</Text>
        <Text style={styles.title}>Lobby</Text>
      </View>

      <View style={styles.statRow}>
        {lobbyFixture.stats.map((stat) => (
          <View key={stat.id} style={styles.statCard}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
            {stat.hint ? <Text style={styles.statHint}>{stat.hint}</Text> : null}
          </View>
        ))}
      </View>

      <View style={styles.guideCard}>
        <Text style={styles.guideEyebrow}>GUIDE CAT</Text>
        <Text style={styles.guideGreeting}>{lobbyFixture.guideAssist.greeting}</Text>
        <Text style={styles.guideSuggestion}>
          {lobbyFixture.guideAssist.suggestion}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Quick entry</Text>
        <View style={styles.quickEntryRow}>
          <QuickEntryChip label="Chat" onPress={() => router.push('/(tabs)/chat')} />
          <QuickEntryChip label="Code" onPress={() => router.push('/(tabs)/code')} />
          <QuickEntryChip label="Work" onPress={() => router.push('/(tabs)/work')} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Recent activity</Text>
        {lobbyFixture.recentActivity.map((entry) => (
          <ActivityRow
            key={entry.id}
            entry={entry}
            onPress={() => {
              if (entry.channelId) {
                router.push(`/(tabs)/chat/${entry.channelId}`);
              }
            }}
          />
        ))}
      </View>

      <Text style={styles.scopeNote}>
        Lobby content scoping is open per SPEC-095 — Phase 6 ships a single-
        column mobile layout against fixture data; live `/lobby` projection
        lands once the desktop / mobile content split is decided.
      </Text>
    </ScrollView>
  );
}

interface QuickEntryChipProps {
  label: string;
  onPress: () => void;
}

function QuickEntryChip({ label, onPress }: QuickEntryChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickEntryChip,
        pressed ? styles.quickEntryChipPressed : null,
      ]}
    >
      <Text style={styles.quickEntryLabel}>{label}</Text>
    </Pressable>
  );
}

interface ActivityRowProps {
  entry: LobbyActivityEntry;
  onPress: () => void;
}

function ActivityRow({ entry, onPress }: ActivityRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.activityRow,
        pressed && entry.channelId ? styles.activityRowPressed : null,
      ]}
    >
      <View style={styles.activityRowText}>
        <Text style={styles.activityTitle} numberOfLines={2}>
          {entry.title}
        </Text>
        <Text style={styles.activityHint}>{entry.hint}</Text>
      </View>
      {entry.channelId ? (
        <Text style={styles.activityChevron}>›</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
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
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bg.panel,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: 2,
  },
  statValue: {
    color: colors.fg.primary,
    ...typography.title,
  },
  statLabel: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  statHint: {
    color: colors.fg.muted,
    ...typography.label,
  },
  guideCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accent.soft,
    gap: spacing.xs,
  },
  guideEyebrow: {
    color: colors.accent.primary,
    ...typography.label,
    letterSpacing: 0.8,
  },
  guideGreeting: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  guideSuggestion: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.fg.muted,
    ...typography.label,
    letterSpacing: 0.6,
  },
  quickEntryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickEntryChip: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bg.panel,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
  },
  quickEntryChipPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  quickEntryLabel: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    gap: spacing.sm,
  },
  activityRowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  activityRowText: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    color: colors.fg.primary,
    ...typography.body,
  },
  activityHint: {
    color: colors.fg.muted,
    ...typography.caption,
  },
  activityChevron: {
    color: colors.fg.muted,
    fontSize: 22,
    lineHeight: 22,
  },
  scopeNote: {
    color: colors.fg.muted,
    ...typography.label,
    marginTop: spacing.md,
  },
});
