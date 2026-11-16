import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { mobileRoutes } from '../../routes';
import {
  getMobileCatCopy,
  getMobileCatsTabCopy,
  getMobileDirectoryCopy,
  mobileCatLimit,
  mobileCatRequests,
  mobileCatSaveError,
  mobileModelChange,
} from '../../../../src/mobile/index.js';
import { CatModelPicker, type MobileModelPick } from '../cats/CatModelPicker';
import { DirectoryMessage } from '../directory/DirectoryParts';
import { SheetError, SheetField, SheetSection } from '../directory/DirectorySheet';
import { useMobileAppShell } from '../hooks/useMobileAppShell';
import { useMobileCatActions } from '../hooks/useMobileCatActions';
import { useMobileLocale } from '../hooks/useMobileLocale';
import { MobileAuthPanel } from './MobileAuthPanel';
import { colors, spacing, typography } from '../theme';

/**
 * A new Cat: its name and the provider and model it runs on, plus whether
 * it is a Boss Cat. Avatars, skills and the rest are set on Desktop.
 */
export function MobileCatCreate() {
  const router = useRouter();
  const locale = useMobileLocale();
  const copy = getMobileCatCopy(locale);
  const tabCopy = getMobileCatsTabCopy(locale);
  const directoryCopy = getMobileDirectoryCopy(locale);
  const shell = useMobileAppShell();
  const actions = useMobileCatActions();
  const [name, setName] = useState('');
  const [pick, setPick] = useState<MobileModelPick | null>(null);
  const [boss, setBoss] = useState(false);
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
        title={copy.newCatTitle}
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

  const limit = mobileCatLimit(shell.state.payload);
  if (limit.reached) {
    return <DirectoryMessage title={copy.limitReached} actionLabel={tabCopy.entityDetailBackToDirectoryLabel} onAction={() => router.back()} />;
  }

  const canSave = name.trim() !== '' && pick !== null && !actions.pending;

  async function save() {
    if (!pick) return;
    const target = mobileModelChange(pick.provider, pick.instance, pick.model, pick.catalog);
    try {
      const created = await actions.send<{ cat?: { id?: string } }>(mobileCatRequests.create({
        name: name.trim(),
        provider: target.provider,
        ...(target.instance ? { instance: target.instance } : {}),
        model: pick.model,
        modelSelection: target.modelSelection,
        ...(boss ? { group: 'admin' as const } : {}),
      }));
      shell.refetch();
      const id = created.cat?.id;
      if (id) router.replace(mobileRoutes.catDetail(id));
      else router.back();
    } catch (failure) {
      setError(mobileCatSaveError(locale, (failure as { body?: unknown }).body, failure instanceof Error ? failure.message : String(failure)));
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (actions.pending ? (
            <ActivityIndicator color={colors.accent.primary} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              onPress={() => { void save(); }}
              hitSlop={8}
            >
              <Text style={[styles.headerAction, canSave ? null : styles.disabled]}>{copy.saveCatAction}</Text>
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
            placeholder={copy.namePlaceholder}
            autoFocus
            returnKeyType="done"
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{copy.bossLabel}</Text>
            <Switch value={boss} onValueChange={setBoss} trackColor={{ true: colors.accent.primary, false: colors.border.strong }} />
          </View>
        </SheetSection>
        <CatModelPicker
          copy={copy}
          actions={actions}
          initial={{ provider: null, instance: null, model: null }}
          selectedModel={pick?.model ?? null}
          onPick={setPick}
        />
        <SheetError message={error} />
        <Text style={styles.hint}>{copy.desktopOnlyHint}</Text>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
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
});
