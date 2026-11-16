import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileRoutes } from '../../routes';
import {
  getMobileCatsTabCopy,
  getMobileDirectoryCopy,
  mobileDirectoryLoadErrorMessage,
  selectMobileCatteryDetail,
  selectMobileClowderDetail,
  type MobileDirectoryMemberRow,
} from '../../../../src/mobile/index.js';
import { CatAvatar, DirectoryMessage, GroupAvatar, StatusChip } from '../directory/DirectoryParts';
import { useMobileAppShell } from '../hooks/useMobileAppShell';
import { useMobileDirectory } from '../hooks/useMobileDirectory';
import { useMobileLocale } from '../hooks/useMobileLocale';
import { MobileAuthPanel } from './MobileAuthPanel';
import { colors, radii, spacing, typography } from '../theme';

/**
 * A Clowder's or Cattery's home on mobile (SPEC-103): who is in it and,
 * for a Cattery, its Clowders. Tapping a Cat opens the Cat; tapping a
 * group opens that group.
 */
export function MobileGroupDetail({ kind, id }: { kind: 'clowder' | 'cattery'; id: string }) {
  const router = useRouter();
  const locale = useMobileLocale();
  const copy = getMobileDirectoryCopy(locale);
  const tabCopy = getMobileCatsTabCopy(locale);
  const shell = useMobileAppShell();
  const directory = useMobileDirectory();

  const retry = () => {
    shell.refetch();
    directory.refetch();
  };

  if (shell.state.kind === 'unconfigured' || directory.state.kind === 'unconfigured') {
    return (
      <DirectoryMessage
        title={tabCopy.connectDesktopTitle}
        body={tabCopy.connectDesktopBody}
        actionLabel={tabCopy.openSettingsAction}
        onAction={() => router.push(mobileRoutes.settings())}
      />
    );
  }
  if (shell.state.kind === 'unauthenticated' || directory.state.kind === 'unauthenticated') {
    return <MobileAuthPanel onAuthenticated={retry} />;
  }
  if (directory.state.kind === 'error') {
    return (
      <DirectoryMessage
        title={kind === 'clowder' ? copy.clowderTitle : copy.catteryTitle}
        body={mobileDirectoryLoadErrorMessage(locale, directory.state.error.body, directory.state.error.message)}
        actionLabel={copy.retryAction}
        onAction={retry}
      />
    );
  }
  if (shell.state.kind === 'error') {
    return (
      <DirectoryMessage
        title={tabCopy.couldNotLoadDirectoryTitle}
        body={shell.state.error.message}
        actionLabel={copy.retryAction}
        onAction={retry}
      />
    );
  }
  if (shell.state.kind !== 'data' || directory.state.kind !== 'data') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  const cats = shell.state.payload.chat.cats;
  const detail = kind === 'clowder'
    ? selectMobileClowderDetail(directory.state.directory, cats, id, locale)
    : selectMobileCatteryDetail(directory.state.directory, cats, id, locale);
  if (!detail) {
    return (
      <DirectoryMessage
        title={kind === 'clowder' ? copy.clowderNotFoundTitle : copy.catteryNotFoundTitle}
        actionLabel={tabCopy.entityDetailBackToDirectoryLabel}
        onAction={() => router.replace(mobileRoutes.catsDirectory())}
      />
    );
  }

  const openCat = (catId: string) => router.push(mobileRoutes.catDetail(catId));

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <GroupAvatar name={detail.name} kind={kind} size="large" />
        <View style={styles.headerText}>
          <Text style={styles.title}>{detail.name}</Text>
          {detail.kind === 'clowder' ? (
            detail.cattery ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(mobileRoutes.catteryDetail(detail.cattery!.id))}
              >
                <Text style={[styles.subtitle, styles.link]}>{detail.subtitle}</Text>
              </Pressable>
            ) : (
              <Text style={styles.subtitle}>{detail.subtitle}</Text>
            )
          ) : detail.domain ? (
            <Text style={styles.subtitle}>{detail.domain}</Text>
          ) : null}
        </View>
      </View>
      {detail.description ? <Text style={styles.description}>{detail.description}</Text> : null}

      <Section title={copy.membersHeading} count={detail.members.length}>
        {detail.members.length === 0 ? (
          <Text style={styles.empty}>
            {kind === 'clowder' ? copy.clowderEmptyMembers : copy.catteryEmptyMembers}
          </Text>
        ) : (
          detail.members.map((member) => (
            <MemberRow key={member.catId} member={member} onPress={() => openCat(member.catId)} />
          ))
        )}
      </Section>

      {detail.kind === 'cattery' ? (
        <Section title={copy.clowdersHeading} count={detail.clowders.length}>
          {detail.clowders.length === 0 ? (
            <Text style={styles.empty}>{copy.catteryEmptyClowders}</Text>
          ) : (
            detail.clowders.map((clowder) => (
              <Pressable
                key={clowder.id}
                accessibilityRole="link"
                onPress={() => router.push(mobileRoutes.clowderDetail(clowder.id))}
                style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
              >
                <GroupAvatar name={clowder.name} kind="clowder" />
                <Text style={[styles.rowName, styles.grow]} numberOfLines={1}>{clowder.name}</Text>
                <Text style={styles.rowDetail}>{clowder.detail}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))
          )}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>{title}</Text>
        <Text style={styles.sectionCount}>({count})</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function MemberRow({ member, onPress }: { member: MobileDirectoryMemberRow; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[member.name, member.role, member.statusLabel].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <CatAvatar name={member.name} color={member.avatarColor} />
      <View style={styles.memberText}>
        <Text style={styles.rowName} numberOfLines={1}>{member.name}</Text>
        <Text style={styles.rowDetail}>{member.role}</Text>
      </View>
      {member.statusLabel ? (
        <StatusChip status={member.status} label={member.statusLabel} ended={member.ended} />
      ) : null}
    </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.fg.primary,
    ...typography.display,
  },
  subtitle: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  link: {
    color: colors.accent.primary,
  },
  description: {
    color: colors.fg.secondary,
    ...typography.body,
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
  empty: {
    color: colors.fg.muted,
    ...typography.caption,
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    gap: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  memberText: {
    flex: 1,
    minWidth: 0,
  },
  grow: {
    flex: 1,
  },
  rowName: {
    flexShrink: 1,
    color: colors.fg.primary,
    ...typography.body,
  },
  rowDetail: {
    color: colors.fg.muted,
    ...typography.label,
  },
  chevron: {
    color: colors.fg.muted,
    fontSize: 22,
    lineHeight: 22,
  },
});
