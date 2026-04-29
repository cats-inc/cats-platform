import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useMobileLobby } from '../hooks/useMobileLobby';
import type {
  MobileLobbyActivityEntry,
  MobileLobbyData,
  MobileLobbyStat,
} from '../../../../src/mobile/index.js';
import { colors, radii, spacing, typography } from '../theme';

export function Lobby() {
  const router = useRouter();
  const { state } = useMobileLobby();

  if (state.kind === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }
  if (state.kind === 'unconfigured') {
    return (
      <Panel
        title="Connect to your desktop"
        body="Set the desktop base URL in Settings to load your lobby."
        actionLabel="Open Settings"
        onAction={() => router.push('/(tabs)/settings')}
      />
    );
  }
  if (state.kind === 'error') {
    return (
      <Panel
        title="Could not load lobby"
        body={state.error.message}
      />
    );
  }

  return (
    <LobbyBody
      data={state.data}
      onSelectActivity={(entry) =>
        router.push(`/(tabs)/chat/${entry.channelId}`)
      }
      onOpenChat={() => router.push('/(tabs)/chat')}
      onOpenCode={() => router.push('/(tabs)/code')}
      onOpenWork={() => router.push('/(tabs)/work')}
    />
  );
}

interface LobbyBodyProps {
  data: MobileLobbyData;
  onSelectActivity: (entry: MobileLobbyActivityEntry) => void;
  onOpenChat: () => void;
  onOpenCode: () => void;
  onOpenWork: () => void;
}

function LobbyBody({
  data,
  onSelectActivity,
  onOpenChat,
  onOpenCode,
  onOpenWork,
}: LobbyBodyProps) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{data.todayLabel}</Text>
        <Text style={styles.title}>Lobby</Text>
      </View>

      <View style={styles.statRow}>
        {data.stats.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Quick entry</Text>
        <View style={styles.quickEntryRow}>
          <QuickEntryChip label="Chat" onPress={onOpenChat} />
          <QuickEntryChip label="Code" onPress={onOpenCode} />
          <QuickEntryChip label="Work" onPress={onOpenWork} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Recent activity</Text>
        {data.recentActivity.length === 0 ? (
          <Text style={styles.emptyActivity}>
            No active conversations yet. Start one from the Chat tab.
          </Text>
        ) : (
          data.recentActivity.map((entry) => (
            <ActivityRow
              key={entry.id}
              entry={entry}
              onPress={() => onSelectActivity(entry)}
            />
          ))
        )}
      </View>

      {__DEV__ ? (
        <Text style={styles.scopeNote}>
          Lobby derives stats + recent activity from `/api/app-shell` until a
          dedicated mobile lobby projection lands. No separate
          persistence schema (per SPEC-095 Open Question resolution).
        </Text>
      ) : null}
    </ScrollView>
  );
}

interface StatCardProps {
  stat: MobileLobbyStat;
}

function StatCard({ stat }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{stat.value}</Text>
      <Text style={styles.statLabel}>{stat.label}</Text>
      {stat.hint ? <Text style={styles.statHint}>{stat.hint}</Text> : null}
    </View>
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
  entry: MobileLobbyActivityEntry;
  onPress: () => void;
}

function ActivityRow({ entry, onPress }: ActivityRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.activityRow,
        pressed ? styles.activityRowPressed : null,
      ]}
    >
      <View style={styles.activityRowText}>
        <Text style={styles.activityTitle} numberOfLines={2}>
          {entry.title}
        </Text>
        <Text style={styles.activityHint}>{entry.hint}</Text>
      </View>
      <Text style={styles.activityChevron}>›</Text>
    </Pressable>
  );
}

interface PanelProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

function Panel({ title, body, actionLabel, onAction }: PanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.panelButton,
            pressed ? styles.panelButtonPressed : null,
          ]}
        >
          <Text style={styles.panelButtonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.canvas,
  },
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
  emptyActivity: {
    color: colors.fg.muted,
    ...typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  scopeNote: {
    color: colors.fg.muted,
    ...typography.label,
    marginTop: spacing.md,
  },
  panel: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
    padding: spacing.xl,
    gap: spacing.md,
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
  panelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.accent.primary,
    marginTop: spacing.sm,
  },
  panelButtonPressed: {
    opacity: 0.85,
  },
  panelButtonLabel: {
    color: colors.fg.inverse,
    ...typography.bodyStrong,
  },
});
