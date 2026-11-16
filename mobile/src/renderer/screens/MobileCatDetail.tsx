import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { mobileRoutes } from '../../routes';
import {
  fillMobileCopy,
  findMobileDirectLaneForCat,
  getMobileCatCopy,
  getMobileCatsTabCopy,
  getMobileDirectoryCopy,
  mobileCatRequests,
  mobileCatSaveError,
  mobileDirectoryLoadErrorMessage,
  mobileModelChange,
  selectMobileCatProfile,
  type MobileCatMembershipTag,
  type MobileUpdateCatInput,
} from '../../../../src/mobile/index.js';
import { CatModelPicker } from '../cats/CatModelPicker';
import { DirectoryMessage, GroupAvatar, StatusChip } from '../directory/DirectoryParts';
import { DirectorySheet, SheetAction, SheetError, SheetField, SheetSection } from '../directory/DirectorySheet';
import { useMobileAppShell } from '../hooks/useMobileAppShell';
import { useMobileCatActions } from '../hooks/useMobileCatActions';
import { useMobileDirectory } from '../hooks/useMobileDirectory';
import { useMobileLocale } from '../hooks/useMobileLocale';
import { MobileAuthPanel } from './MobileAuthPanel';
import { colors, radii, spacing, typography } from '../theme';

/**
 * A Cat on the phone (SPEC-095 FR-17 as amended): who it is, the Clowders
 * and Catteries it is in, and its core settings — name, model, Boss Cat,
 * archive and delete. The rest of its settings stay on Desktop.
 */
export function MobileCatDetail({ catId }: { catId: string }) {
  const router = useRouter();
  const locale = useMobileLocale();
  const copy = getMobileCatCopy(locale);
  const tabCopy = getMobileCatsTabCopy(locale);
  const directoryCopy = getMobileDirectoryCopy(locale);
  const shell = useMobileAppShell();
  const directory = useMobileDirectory();
  const actions = useMobileCatActions();
  const [sheet, setSheet] = useState<'rename' | 'model' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (shell.state.kind === 'unconfigured') {
    return (
      <DirectoryMessage
        title={tabCopy.connectDesktopTitle}
        body={tabCopy.connectDesktopBody}
        actionLabel={tabCopy.openSettingsAction}
        onAction={() => router.push(mobileRoutes.settings())}
      />
    );
  }
  if (shell.state.kind === 'unauthenticated') {
    return <MobileAuthPanel onAuthenticated={shell.refetch} />;
  }
  if (shell.state.kind === 'error') {
    return (
      <DirectoryMessage
        title={tabCopy.couldNotLoadDirectoryTitle}
        body={shell.state.error.message}
        actionLabel={directoryCopy.retryAction}
        onAction={shell.refetch}
      />
    );
  }
  if (shell.state.kind !== 'data') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  const payload = shell.state.payload;
  const profile = selectMobileCatProfile(
    payload,
    directory.state.kind === 'data' ? directory.state.directory : null,
    catId,
    locale,
  );
  if (!profile) {
    return (
      <DirectoryMessage
        title={copy.notFoundTitle}
        actionLabel={tabCopy.entityDetailBackToDirectoryLabel}
        onAction={() => router.replace(mobileRoutes.catsDirectory())}
      />
    );
  }
  const { cat } = profile;

  const change = async (patch: MobileUpdateCatInput): Promise<string | null> => {
    try {
      await actions.send(mobileCatRequests.update(cat.id, patch));
      shell.refetch();
      directory.refetch();
      setError(null);
      return null;
    } catch (failure) {
      const message = mobileCatSaveError(locale, (failure as { body?: unknown }).body, failure instanceof Error ? failure.message : String(failure));
      setError(message);
      return message;
    }
  };

  const confirmThen = (title: string, message: string, confirmLabel: string, destructive: boolean, run: () => void) => {
    Alert.alert(title, message, [
      { text: copy.cancelAction, style: 'cancel' },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: run },
    ]);
  };

  const openDirectMessage = () => {
    const lane = findMobileDirectLaneForCat(payload.chat.channels, cat.id);
    router.push(lane
      ? mobileRoutes.productChannel('chat', lane.id)
      : mobileRoutes.productNewDraft('chat', { entryKind: 'direct', directLane: { catId: cat.id, catName: cat.name } }));
  };

  const target = cat.defaultExecutionTarget ?? null;

  return (
    <>
      <Stack.Screen options={{ title: cat.name }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.avatar, cat.avatarColor ? { backgroundColor: cat.avatarColor } : null]}>
            <Text style={styles.avatarInitial}>{cat.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2}>{cat.name}</Text>
            <View style={styles.badges}>
              {profile.isBoss ? <Badge label={copy.bossBadge} tone="accent" /> : null}
              {profile.archived ? <Badge label={copy.archivedBadge} tone="muted" /> : null}
            </View>
            {profile.executionLabel ? <Text style={styles.caption}>{profile.executionLabel}</Text> : null}
          </View>
        </View>

        {!profile.archived ? (
          <Pressable
            accessibilityRole="button"
            onPress={openDirectMessage}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.primaryButtonLabel}>{copy.directMessage}</Text>
          </Pressable>
        ) : null}

        <Memberships
          tags={profile.memberships}
          failed={directory.state.kind === 'error'}
          retryLabel={directoryCopy.retryAction}
          loadFailed={directory.state.kind === 'error'
            ? mobileDirectoryLoadErrorMessage(locale, directory.state.error.body, directory.state.error.message)
            : null}
          heading={copy.membershipsHeading}
          onRetry={directory.refetch}
          onOpen={(tag) => router.push(tag.kind === 'clowder' ? mobileRoutes.clowderDetail(tag.id) : mobileRoutes.catteryDetail(tag.id))}
        />

        <SheetSection title={copy.settingsHeading}>
          {!profile.archived ? (
            <>
              <SheetAction label={copy.nameLabel} detail={cat.name} onPress={() => setSheet('rename')} disabled={actions.pending} />
              <SheetAction
                label={copy.modelLabel}
                detail={profile.executionLabel ?? target?.model ?? undefined}
                onPress={() => setSheet('model')}
                disabled={actions.pending}
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{copy.bossLabel}</Text>
                <Switch
                  value={profile.isBoss}
                  disabled={actions.pending}
                  onValueChange={(next) => { void change({ group: next ? 'admin' : 'standard' }); }}
                  trackColor={{ true: colors.accent.primary, false: colors.border.strong }}
                />
              </View>
              <SheetAction
                label={copy.archiveAction}
                disabled={actions.pending}
                onPress={() => confirmThen(
                  copy.archiveConfirmTitle,
                  fillMobileCopy(profile.hasBotBinding ? copy.archiveWithBotConfirmMessage : copy.archiveConfirmMessage, { catName: cat.name }),
                  copy.archiveAction,
                  false,
                  () => { void change({ archive: true }); },
                )}
              />
            </>
          ) : (
            // As in Desktop Settings: only an archived Cat can be recovered or deleted.
            <>
              <SheetAction
                label={copy.recoverAction}
                tone="accent"
                disabled={actions.pending}
                onPress={() => confirmThen(
                  copy.recoverConfirmTitle,
                  fillMobileCopy(copy.recoverConfirmMessage, { catName: cat.name }),
                  copy.recoverConfirmAction,
                  false,
                  () => { void change({ unarchive: true }); },
                )}
              />
              <SheetAction
                label={copy.deleteAction}
                tone="danger"
                disabled={actions.pending}
                onPress={() => confirmThen(
                  copy.deleteConfirmTitle,
                  fillMobileCopy(copy.deleteConfirmMessage, { catName: cat.name }),
                  copy.deleteConfirmAction,
                  true,
                  () => {
                    void actions.send(mobileCatRequests.remove(cat.id)).then(
                      () => {
                        shell.refetch();
                        router.back();
                      },
                      (failure: unknown) => {
                        setError(mobileCatSaveError(locale, (failure as { body?: unknown }).body, failure instanceof Error ? failure.message : String(failure)));
                      },
                    );
                  },
                )}
              />
            </>
          )}
        </SheetSection>
        <SheetError message={error} />
        <Text style={styles.hint}>{copy.desktopOnlyHint}</Text>
      </ScrollView>

      <RenameSheet
        visible={sheet === 'rename'}
        name={cat.name}
        copy={copy}
        pending={actions.pending}
        onClose={() => setSheet(null)}
        onSave={async (name) => {
          const message = name === cat.name ? null : await change({ name });
          if (!message) setSheet(null);
          return message;
        }}
      />
      <DirectorySheet visible={sheet === 'model'} title={copy.modelLabel} closeLabel={copy.cancelAction} onClose={() => setSheet(null)}>
        <Text style={styles.hint}>{copy.modelResetHint}</Text>
        <CatModelPicker
          copy={copy}
          actions={actions}
          initial={{ provider: target?.provider ?? null, instance: target?.instance ?? null, model: target?.model ?? null }}
          onPick={(pick) => {
            if (pick.provider === target?.provider && pick.model === target?.model && pick.instance === target?.instance) {
              setSheet(null);
              return;
            }
            void change(mobileModelChange(pick.provider, pick.instance, pick.model, pick.catalog)).then((message) => {
              if (!message) setSheet(null);
            });
          }}
        />
        <SheetError message={error} />
      </DirectorySheet>
    </>
  );
}

function Badge({ label, tone }: { label: string; tone: 'accent' | 'muted' }) {
  return (
    <View style={[styles.badge, tone === 'accent' ? styles.badgeAccent : styles.badgeMuted]}>
      <Text style={[styles.badgeText, tone === 'accent' ? styles.badgeAccentText : styles.badgeMutedText]}>{label}</Text>
    </View>
  );
}

/**
 * The Cat's groups, each opening its home. A Cat in none shows nothing —
 * no Cat has to be in a group — and a failed read offers a retry so it
 * never reads as "in no groups".
 */
function Memberships({
  tags,
  failed,
  loadFailed,
  retryLabel,
  heading,
  onRetry,
  onOpen,
}: {
  tags: MobileCatMembershipTag[] | null;
  failed: boolean;
  loadFailed: string | null;
  retryLabel: string;
  heading: string;
  onRetry: () => void;
  onOpen: (tag: MobileCatMembershipTag) => void;
}) {
  if (failed) {
    return (
      <View style={styles.membershipsError}>
        <Text style={styles.caption}>{loadFailed}</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
          <Text style={styles.link}>{retryLabel}</Text>
        </Pressable>
      </View>
    );
  }
  if (!tags || tags.length === 0) return null;
  return (
    <View style={styles.memberships}>
      <Text style={styles.sectionTitle}>{heading}</Text>
      <View style={styles.tags}>
        {tags.map((tag) => (
          <Pressable
            key={`${tag.kind}:${tag.id}`}
            accessibilityRole="link"
            accessibilityLabel={[tag.name, tag.role, tag.statusLabel].filter(Boolean).join(', ')}
            onPress={() => onOpen(tag)}
            style={({ pressed }) => [styles.tag, pressed ? styles.tagPressed : null]}
          >
            <GroupAvatar name={tag.name} kind={tag.kind} />
            <Text style={styles.tagName} numberOfLines={1}>{tag.name}</Text>
            <Text style={styles.tagRole}>{tag.role}</Text>
            {tag.statusLabel ? <StatusChip status={tag.status} label={tag.statusLabel} ended={tag.ended} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RenameSheet({
  visible,
  name,
  copy,
  pending,
  onClose,
  onSave,
}: {
  visible: boolean;
  name: string;
  copy: ReturnType<typeof getMobileCatCopy>;
  pending: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setDraft(name);
      setError(null);
    }
  }, [visible, name]);
  return (
    <DirectorySheet
      visible={visible}
      title={copy.nameLabel}
      closeLabel={copy.cancelAction}
      onClose={onClose}
      primary={{
        label: copy.saveAction,
        disabled: draft.trim() === '' || pending,
        busy: pending,
        onPress: () => { void onSave(draft.trim()).then(setError); },
      }}
    >
      <SheetSection>
        <SheetField label={copy.nameLabel} value={draft} onChangeText={setDraft} autoFocus placeholder={copy.namePlaceholder} />
      </SheetSection>
      <SheetError message={error} />
    </DirectorySheet>
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
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#8B7E74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.fg.primary,
    ...typography.display,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  badgeAccent: {
    backgroundColor: colors.accent.soft,
  },
  badgeMuted: {
    backgroundColor: colors.status.mutedBg,
  },
  badgeText: {
    ...typography.label,
  },
  badgeAccentText: {
    color: colors.accent.primary,
  },
  badgeMutedText: {
    color: colors.status.mutedText,
  },
  caption: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  primaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accent.primary,
  },
  primaryButtonLabel: {
    color: colors.fg.inverse,
    ...typography.bodyStrong,
  },
  pressed: {
    opacity: 0.85,
  },
  memberships: {
    gap: spacing.xs,
  },
  membershipsError: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.fg.secondary,
    ...typography.label,
    marginLeft: spacing.xs,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.panel,
  },
  tagPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  tagName: {
    flexShrink: 1,
    color: colors.fg.primary,
    ...typography.caption,
    fontWeight: '600',
  },
  tagRole: {
    color: colors.fg.muted,
    ...typography.label,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  switchLabel: {
    flex: 1,
    color: colors.fg.primary,
    ...typography.body,
  },
  hint: {
    color: colors.fg.muted,
    ...typography.caption,
  },
  link: {
    color: colors.accent.primary,
    ...typography.caption,
    fontWeight: '600',
  },
});
