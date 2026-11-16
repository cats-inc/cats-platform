import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  pickMobileDefaultModel,
  readMobileDirectoryErrorCode,
  type MobileCatCopy,
  type MobileProviderDescriptor,
  type MobileProviderModelCatalog,
} from '../../../../src/mobile/index.js';
import { SheetAction, SheetSection } from '../directory/DirectorySheet';
import type { MobileCatActions } from '../hooks/useMobileCatActions';
import { colors, spacing, typography } from '../theme';

export interface MobileModelPick {
  provider: string;
  instance: string | null;
  model: string;
  catalog: MobileProviderModelCatalog;
}

type RegistryState =
  | { kind: 'loading' }
  | { kind: 'ready'; providers: MobileProviderDescriptor[] }
  | { kind: 'message'; text: string };

type CatalogState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; catalog: MobileProviderModelCatalog }
  | { kind: 'message'; text: string };

/**
 * Provider, then model, from what Runtime can run now (`/api/providers`).
 * Runtime being unreachable, or having no usable target, is said in
 * Desktop's words rather than shown as an empty list.
 */
export function CatModelPicker({
  copy,
  actions,
  initial,
  selectedModel,
  onPick,
}: {
  copy: MobileCatCopy;
  actions: Pick<MobileCatActions, 'readProviders' | 'readModels'>;
  initial: { provider: string | null; instance: string | null; model: string | null };
  /**
   * The model shown as chosen, for a form that saves later. Such a form
   * also gets the provider's default model picked when its list loads, so
   * it can be saved without another tap.
   */
  selectedModel?: string | null;
  onPick: (pick: MobileModelPick) => void;
}) {
  const formRef = useRef({ selectedModel, onPick });
  formRef.current = { selectedModel, onPick };
  // Copy and the starting target are fresh objects on every render; reading
  // them through a ref keeps a re-render (typing a name) from reloading the
  // lists and resetting the provider the owner picked.
  const settingsRef = useRef({ copy, initial });
  settingsRef.current = { copy, initial };
  const [registry, setRegistry] = useState<RegistryState>({ kind: 'loading' });
  const [provider, setProvider] = useState<MobileProviderDescriptor | null>(null);
  const [instance, setInstance] = useState<string | null>(initial.instance);
  const [catalog, setCatalog] = useState<CatalogState>({ kind: 'idle' });
  const { readProviders, readModels } = actions;

  const loadRegistry = useCallback(async () => {
    const { copy, initial } = settingsRef.current;
    setRegistry({ kind: 'loading' });
    try {
      const next = await readProviders();
      if (next.state === 'runtime_unreachable') {
        setRegistry({ kind: 'message', text: copy.runtimeUnreachable });
        return;
      }
      if (next.providers.length === 0) {
        setRegistry({ kind: 'message', text: copy.noUsableTargets });
        return;
      }
      setRegistry({ kind: 'ready', providers: next.providers });
      const start = next.providers.find((entry) => entry.id === initial.provider) ?? next.providers[0]!;
      setProvider(start);
      setInstance(start.id === initial.provider ? initial.instance : start.defaultInstance);
    } catch {
      setRegistry({ kind: 'message', text: copy.providerLoadFailed });
    }
  }, [readProviders]);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  useEffect(() => {
    if (!provider) return;
    const { copy } = settingsRef.current;
    let active = true;
    setCatalog({ kind: 'loading' });
    readModels(provider.id, instance).then(
      (next) => {
        if (!active) return;
        setCatalog(next.models.length > 0 ? { kind: 'ready', catalog: next } : { kind: 'message', text: copy.noModels });
        const form = formRef.current;
        if (form.selectedModel === undefined) return;
        const start = pickMobileDefaultModel(next, form.selectedModel);
        if (start && start !== form.selectedModel) form.onPick({ provider: provider.id, instance, model: start, catalog: next });
      },
      (error: { body?: unknown }) => {
        if (!active) return;
        const code = readMobileDirectoryErrorCode(error?.body);
        setCatalog({
          kind: 'message',
          text: code === 'runtime_unreachable'
            ? copy.runtimeUnreachable
            : code === 'provider_target_unavailable' ? copy.noUsableTargets : copy.noModels,
        });
      },
    );
    return () => {
      active = false;
    };
  }, [instance, provider, readModels]);

  if (registry.kind === 'loading') {
    return <Loading label={copy.loadingProviders} />;
  }
  if (registry.kind === 'message') {
    return (
      <SheetSection title={copy.providerLabel}>
        <Text style={styles.message}>{registry.text}</Text>
      </SheetSection>
    );
  }

  // A form shows its own pick; a sheet that saves at once shows the Cat's model.
  const current = selectedModel !== undefined
    ? selectedModel
    : provider?.id === initial.provider ? initial.model : null;

  return (
    <>
      <SheetSection title={copy.providerLabel}>
        {registry.providers.map((entry) => (
          <SheetAction
            key={entry.id}
            label={entry.label}
            selected={entry.id === provider?.id}
            onPress={() => {
              if (entry.id === provider?.id) return;
              setProvider(entry);
              setInstance(entry.id === initial.provider ? initial.instance : entry.defaultInstance);
            }}
          />
        ))}
      </SheetSection>
      <SheetSection title={copy.modelLabel}>
        {catalog.kind === 'loading' || catalog.kind === 'idle' ? (
          <Loading label={copy.loadingModels} />
        ) : catalog.kind === 'message' ? (
          <Text style={styles.message}>{catalog.text}</Text>
        ) : (
          catalog.catalog.models.map((model) => (
            <SheetAction
              key={model.id}
              label={model.label}
              detail={model.label === model.id ? undefined : model.id}
              selected={model.id === current}
              onPress={() => onPick({ provider: provider!.id, instance, model: model.id, catalog: catalog.catalog })}
            />
          ))
        )}
      </SheetSection>
    </>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent.primary} />
      <Text style={styles.message}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  message: {
    color: colors.fg.secondary,
    ...typography.caption,
    padding: spacing.md,
  },
});
