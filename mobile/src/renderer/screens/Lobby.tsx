import { useCallback, useState } from 'react';
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
  MobileLobbyCatSummary,
  MobileLobbyCopy,
  MobileLobbyData,
} from '../../../../src/mobile/index.js';
import {
  getMobileLobbyCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';
import { colors, radii, spacing, typography } from '../theme';

type SectionKey = 'cats' | 'clowders' | 'catteries';

interface SectionDescriptor {
  key: SectionKey;
  label: string;
  count: number;
  newRowLabel: string;
  emptyLabel: string;
  empty: boolean;
}

export function Lobby() {
  const router = useRouter();
  const { state } = useMobileLobby();
  const copy = getMobileLobbyCopy(resolveDefaultMobileLocale());

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
        title={copy.connectDesktopTitle}
        body={copy.connectDesktopBody}
        actionLabel={copy.openSettingsAction}
        onAction={() => router.push('/(tabs)/settings')}
      />
    );
  }
  if (state.kind === 'error') {
    return (
      <Panel
        title={copy.couldNotLoadLobbyTitle}
        body={state.error.message}
      />
    );
  }

  return (
    <LobbyBody
      data={state.data}
      copy={copy}
      onSelectCat={(catId) =>
        router.push(`/(tabs)/cats/${encodeURIComponent(catId)}`)
      }
    />
  );
}

interface LobbyBodyProps {
  data: MobileLobbyData;
  copy: MobileLobbyCopy;
  onSelectCat: (catId: string) => void;
}

function LobbyBody({ data, copy, onSelectCat }: LobbyBodyProps) {
  const sections: SectionDescriptor[] = [
    {
      key: 'cats',
      label: copy.sectionMyCats,
      count: data.cats.length,
      newRowLabel: copy.newCat,
      emptyLabel: copy.emptyCats,
      empty: data.cats.length === 0,
    },
    {
      key: 'clowders',
      label: copy.sectionMyClowders,
      count: data.clowders.length,
      newRowLabel: copy.newClowder,
      emptyLabel: copy.emptyClowders,
      empty: data.clowders.length === 0,
    },
    {
      key: 'catteries',
      label: copy.sectionMyCatteries,
      count: data.catteries.length,
      newRowLabel: copy.newCattery,
      emptyLabel: copy.emptyCatteries,
      empty: data.catteries.length === 0,
    },
  ];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{copy.lobbyTitle}</Text>
      </View>

      {sections.map((section) => (
        <SidebarSection key={section.key} section={section} copy={copy}>
          {section.key === 'cats'
            ? data.cats.map((cat) => (
                <CatRow key={cat.id} cat={cat} onPress={() => onSelectCat(cat.id)} />
              ))
            : null}
        </SidebarSection>
      ))}
    </ScrollView>
  );
}

interface SidebarSectionProps {
  section: SectionDescriptor;
  copy: MobileLobbyCopy;
  children: React.ReactNode;
}

function SidebarSection({ section, copy, children }: SidebarSectionProps) {
  // Default collapsed (PLAN-091 §Resolved Decisions). User-driven
  // expand state is local to the screen for the mobile slice — the
  // desktop sidebar persists in `localStorage`; AsyncStorage parity on
  // mobile is a separate task.
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((current) => !current), []);
  const toggleLabel = expanded
    ? copy.collapseSectionLabel(section.label)
    : copy.expandSectionLabel(section.label);

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed ? styles.sectionHeaderPressed : null,
        ]}
      >
        <Text style={styles.sectionChevron}>{expanded ? '▾' : '▸'}</Text>
        <Text style={styles.sectionLabel}>{section.label}</Text>
        <Text style={styles.sectionCount}>({section.count})</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.sectionBody}>
          {section.empty ? (
            <Text style={styles.sectionEmpty}>{section.emptyLabel}</Text>
          ) : (
            children
          )}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.newRow,
              pressed ? styles.newRowPressed : null,
            ]}
          >
            <Text style={styles.newRowLabel}>{section.newRowLabel}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

interface CatRowProps {
  cat: MobileLobbyCatSummary;
  onPress: () => void;
}

function CatRow({ cat, onPress }: CatRowProps) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.catRow,
        pressed ? styles.catRowPressed : null,
      ]}
    >
      <View
        style={[
          styles.catAvatar,
          cat.avatarColor ? { backgroundColor: cat.avatarColor } : null,
        ]}
      >
        <Text style={styles.catInitial} numberOfLines={1}>
          {cat.name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <Text style={styles.catName} numberOfLines={1}>
        {cat.name}
      </Text>
      <Text style={styles.catChevron}>›</Text>
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
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.fg.primary,
    ...typography.display,
  },
  section: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.panel,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  sectionHeaderPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  sectionChevron: {
    color: colors.fg.muted,
    width: 14,
    textAlign: 'center',
  },
  sectionLabel: {
    flex: 1,
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  sectionCount: {
    color: colors.fg.muted,
    ...typography.caption,
  },
  sectionBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  sectionEmpty: {
    color: colors.fg.muted,
    ...typography.caption,
    paddingVertical: spacing.xs,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    gap: spacing.sm,
  },
  catRowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  catAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#8B7E74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catInitial: {
    color: '#fff',
    ...typography.label,
  },
  catName: {
    flex: 1,
    color: colors.fg.primary,
    ...typography.body,
  },
  catChevron: {
    color: colors.fg.muted,
    fontSize: 22,
    lineHeight: 22,
  },
  newRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  newRowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  newRowLabel: {
    color: colors.accent.primary,
    ...typography.caption,
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
