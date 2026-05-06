import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useCatsDirectoryTab } from '../hooks/useCatsDirectoryTab';
import type {
  MobileCatsDirectoryCatSummary,
  MobileCatsDirectoryData,
  MobileCatsTabCopy,
} from '../../../../src/mobile/index.js';
import {
  getMobileCatsTabCopy,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';
import {
  getMobileNewEntityDesktopOnlyAlertCopy,
  type MobileCatsDirectorySectionKey,
} from '../../api/fixtures/productSidebar';
import { colors, radii, spacing, typography } from '../theme';

type SectionKey = MobileCatsDirectorySectionKey;

interface SectionDescriptor {
  key: SectionKey;
  label: string;
  count: number;
  newRowLabel: string;
  emptyLabel: string;
  empty: boolean;
}

export function CatsDirectoryTab() {
  const router = useRouter();
  const { state } = useCatsDirectoryTab();
  const locale = resolveDefaultMobileLocale();
  const copy = getMobileCatsTabCopy(locale);
  const tabsCopy = getMobileTabsCopy(locale);

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
        title={copy.couldNotLoadDirectoryTitle}
        body={state.error.message}
      />
    );
  }

  const handleCreateNew = (sectionKey: SectionKey) => {
    const desktopOnly = getMobileNewEntityDesktopOnlyAlertCopy(sectionKey, copy);
    if (!desktopOnly) {
      return;
    }
    Alert.alert(
      desktopOnly.title,
      desktopOnly.body,
      [{ text: tabsCopy.desktopOnlyOkAction, style: 'cancel' }],
    );
  };

  return (
    <DirectoryBody
      data={state.data}
      copy={copy}
      onSelectCat={(catId) =>
        router.push(`/(tabs)/cats/${encodeURIComponent(catId)}`)
      }
      onCreateNew={handleCreateNew}
    />
  );
}

interface DirectoryBodyProps {
  data: MobileCatsDirectoryData;
  copy: MobileCatsTabCopy;
  onSelectCat: (catId: string) => void;
  onCreateNew: (sectionKey: SectionKey) => void;
}

function DirectoryBody({ data, copy, onSelectCat, onCreateNew }: DirectoryBodyProps) {
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
        <Text style={styles.title}>{copy.catsTabTitle}</Text>
      </View>

      {sections.map((section) => (
        <DirectorySection
          key={section.key}
          section={section}
          onCreateNew={() => onCreateNew(section.key)}
        >
          {section.key === 'cats'
            ? data.cats.map((cat) => (
                <CatRow key={cat.id} cat={cat} onPress={() => onSelectCat(cat.id)} />
              ))
            : null}
        </DirectorySection>
      ))}
    </ScrollView>
  );
}

interface DirectorySectionProps {
  section: SectionDescriptor;
  onCreateNew: () => void;
  children: React.ReactNode;
}

function DirectorySection({ section, onCreateNew, children }: DirectorySectionProps) {
  // Sections are static (no expand/collapse) so they match the web
  // Cats Directory's flat layout. Earlier mobile slice introduced a
  // toggle here to defer the empty-state copy; web doesn't have it
  // and the user explicitly asked for the same shape on mobile.
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>{section.label}</Text>
        <Text style={styles.sectionCount}>({section.count})</Text>
      </View>
      <View style={styles.sectionBody}>
        {section.empty ? (
          <Text style={styles.sectionEmpty}>{section.emptyLabel}</Text>
        ) : (
          children
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={section.newRowLabel}
          onPress={onCreateNew}
          style={({ pressed }) => [
            styles.newRow,
            pressed ? styles.newRowPressed : null,
          ]}
        >
          <Text style={styles.newRowLabel}>{section.newRowLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface CatRowProps {
  cat: MobileCatsDirectoryCatSummary;
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
