import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileRoutes } from '../../routes';
import {
  findCreatedMobileGroupId,
  getMobileCatsTabCopy,
  getMobileDirectoryCopy,
  getMobileDirectoryEditCopy,
  mobileDirectoryLoadErrorMessage,
  mobileDirectoryRequests,
  mobileDirectorySaveError,
  type MobileDirectoryKind,
} from '../../../../src/mobile/index.js';
import { DirectoryMessage, GroupAvatar } from '../directory/DirectoryParts';
import { SheetAction, SheetError, SheetField, SheetSection } from '../directory/DirectorySheet';
import { useMobileDirectory } from '../hooks/useMobileDirectory';
import { useMobileLocale } from '../hooks/useMobileLocale';
import { MobileAuthPanel } from './MobileAuthPanel';
import { colors, spacing, typography } from '../theme';

/**
 * A new Clowder or Cattery. A Clowder's Cattery is chosen here and cannot
 * change later (SPEC-103); no Cat has to be added, and members are added
 * from the group's home afterwards.
 */
export function MobileGroupCreate({
  kind,
  presetCatteryId,
}: {
  kind: MobileDirectoryKind;
  presetCatteryId: string | null;
}) {
  const router = useRouter();
  const locale = useMobileLocale();
  const copy = getMobileDirectoryEditCopy(locale);
  const directoryCopy = getMobileDirectoryCopy(locale);
  const tabCopy = getMobileCatsTabCopy(locale);
  const directory = useMobileDirectory();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('');
  const [parent, setParent] = useState<string | null>(presetCatteryId);
  const [error, setError] = useState<string | null>(null);

  if (directory.state.kind === 'unconfigured') {
    return (
      <DirectoryMessage
        title={tabCopy.connectDesktopTitle}
        body={tabCopy.connectDesktopBody}
        actionLabel={tabCopy.openSettingsAction}
        onAction={() => router.push(mobileRoutes.settings())}
      />
    );
  }
  if (directory.state.kind === 'unauthenticated') {
    return <MobileAuthPanel onAuthenticated={directory.refetch} />;
  }
  if (directory.state.kind === 'error') {
    return (
      <DirectoryMessage
        title={kind === 'clowder' ? copy.newClowderTitle : copy.newCatteryTitle}
        body={mobileDirectoryLoadErrorMessage(locale, directory.state.error.body, directory.state.error.message)}
        actionLabel={directoryCopy.retryAction}
        onAction={directory.refetch}
      />
    );
  }
  if (directory.state.kind !== 'data') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  const before = directory.state.directory;
  const catteries = before.catteries;

  async function save() {
    const request = kind === 'clowder'
      ? mobileDirectoryRequests.createClowder({ name: name.trim(), description: description.trim() || null, parentCatteryId: parent })
      : mobileDirectoryRequests.createCattery({ name: name.trim(), description: description.trim() || null, domain: domain.trim() || null });
    try {
      const after = await directory.run(request);
      const createdId = findCreatedMobileGroupId(before, after, kind);
      if (!createdId) {
        router.back();
        return;
      }
      router.replace(kind === 'clowder' ? mobileRoutes.clowderDetail(createdId) : mobileRoutes.catteryDetail(createdId));
    } catch (failure) {
      const body = (failure as { body?: unknown }).body;
      setError(mobileDirectorySaveError(locale, body, failure instanceof Error ? failure.message : String(failure)).message);
    }
  }

  const canSave = name.trim() !== '' && !directory.pending;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (directory.pending ? (
            <ActivityIndicator color={colors.accent.primary} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              onPress={() => { void save(); }}
              hitSlop={8}
            >
              <Text style={[styles.headerAction, canSave ? null : styles.disabled]}>
                {kind === 'clowder' ? copy.saveClowderAction : copy.saveCatteryAction}
              </Text>
            </Pressable>
          )),
        }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SheetSection>
          <SheetField
            label={copy.nameLabel}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError(null);
            }}
            maxLength={80}
            autoFocus
            autoCapitalize="words"
            returnKeyType="next"
          />
          <SheetField
            label={copy.descriptionLabel}
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
            placeholder={kind === 'clowder' ? copy.clowderDescriptionPlaceholder : copy.catteryDescriptionPlaceholder}
          />
          {kind === 'cattery' ? (
            <SheetField
              label={copy.domainLabel}
              value={domain}
              onChangeText={setDomain}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="acme.com"
            />
          ) : null}
        </SheetSection>
        {kind === 'clowder' ? (
          <SheetSection
            title={copy.parentHeading}
            hint={`${parent === null ? copy.parentNoneHint : ''} ${copy.parentFixedHint}`.trim()}
          >
            <SheetAction label={copy.parentNone} selected={parent === null} onPress={() => setParent(null)} />
            {catteries.map((cattery) => (
              <SheetAction
                key={cattery.id}
                label={cattery.name}
                selected={parent === cattery.id}
                leading={<GroupAvatar name={cattery.name} kind="cattery" />}
                onPress={() => setParent(cattery.id)}
              />
            ))}
          </SheetSection>
        ) : null}
        <SheetError message={error} />
      </ScrollView>
    </>
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
  headerAction: {
    color: colors.accent.primary,
    ...typography.bodyStrong,
  },
  disabled: {
    opacity: 0.45,
  },
});
