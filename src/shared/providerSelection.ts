import type {
  ProductProviderDescriptor,
  ProviderAdvancedControlValue,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from './providerCatalog.js';
import {
  normalizeProductProviderModelId,
  resolveProviderCatalogDefaultModel,
} from './providerCatalog.js';

export interface ProviderModelSelection {
  entryId?: string;
  entryMode: 'auto' | 'explicit';
  presetId?: string;
  controls?: Record<string, ProviderAdvancedControlValue>;
}

export interface ProviderModelResolution {
  entryId: string;
  model: string;
  entryMode: 'auto' | 'explicit';
  presetId?: string;
  controls?: Record<string, ProviderAdvancedControlValue>;
  supportTier?: 'full' | 'entry_only' | 'read_only';
  warnings: string[];
}

export interface ProviderTargetSelection {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  modelResolution?: ProviderModelResolution | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isControlValue(value: unknown): value is ProviderAdvancedControlValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function cloneSelectionControls(
  controls: Record<string, ProviderAdvancedControlValue> | undefined,
): Record<string, ProviderAdvancedControlValue> | undefined {
  if (!controls) {
    return undefined;
  }

  const entries = Object.entries(controls).filter(([, value]) => isControlValue(value));
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function filterApplicableControls(
  advancedCatalog: ProviderAdvancedModelCatalog | null | undefined,
  entryId: string,
  controls: Record<string, ProviderAdvancedControlValue> | undefined,
): Record<string, ProviderAdvancedControlValue> | undefined {
  if (!advancedCatalog || !controls) {
    return cloneSelectionControls(controls);
  }

  const allowedControls = advancedCatalog.controls.filter((control) =>
    !control.applicableEntryIds
    || control.applicableEntryIds.length === 0
    || control.applicableEntryIds.includes(entryId));
  const allowedControlMap = new Map(allowedControls.map((control) => [control.key, control]));
  const entries = Object.entries(controls).filter(([key, value]) => {
    const control = allowedControlMap.get(key);
    if (!control || !isControlValue(value)) {
      return false;
    }
    if (control.kind !== 'enum' || typeof value !== 'string' || !control.values?.length) {
      return true;
    }
    return control.values.some((option) =>
      option.value === value
      && (
        !option.applicableEntryIds
        || option.applicableEntryIds.length === 0
        || option.applicableEntryIds.includes(entryId)
      ));
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeProviderEntryAlias(input: {
  provider: string;
  backend: string | null | undefined;
  catalog: ProviderModelCatalog;
  model: string | null | undefined;
}): string | null {
  const normalizedModel = normalizeProductProviderModelId(input.provider, input.model) ?? '';
  if (!normalizedModel) {
    return null;
  }

  if (
    input.provider === 'claude'
    && input.backend === 'cli'
    && input.catalog.models.some((option) => option.id === 'opus')
  ) {
    return normalizedModel;
  }

  return normalizedModel;
}

function normalizeTargetAliases(input: {
  target: ProviderTargetSelection;
  catalog: ProviderModelCatalog;
  advancedCatalog?: ProviderAdvancedModelCatalog | null;
}): ProviderTargetSelection {
  const backend = input.advancedCatalog?.backend ?? input.catalog.backend;
  const normalizedModel = normalizeProviderEntryAlias({
    provider: input.target.provider,
    backend,
    catalog: input.catalog,
    model: input.target.model,
  });
  const clonedSelection = cloneProviderModelSelection(input.target.modelSelection);
  if (clonedSelection?.entryId) {
    const normalizedEntryId = normalizeProviderEntryAlias({
      provider: input.target.provider,
      backend,
      catalog: input.catalog,
      model: clonedSelection.entryId,
    });
    if (normalizedEntryId) {
      clonedSelection.entryId = normalizedEntryId;
    }
  }

  return {
    ...input.target,
    ...(normalizedModel ? { model: normalizedModel } : {}),
    ...(clonedSelection ? { modelSelection: clonedSelection } : {}),
  };
}

function isApplicablePreset(
  advancedCatalog: ProviderAdvancedModelCatalog,
  entryId: string,
  presetId: string | null | undefined,
): presetId is string {
  if (!presetId) {
    return false;
  }

  return advancedCatalog.presets.some((preset) =>
    preset.id === presetId
    && (
      !preset.applicableEntryIds
      || preset.applicableEntryIds.length === 0
      || preset.applicableEntryIds.includes(entryId)
    ));
}

function resolvePreset(
  advancedCatalog: ProviderAdvancedModelCatalog | null,
  entryId: string,
  presetId: string | null | undefined,
) {
  if (!advancedCatalog || !presetId || !isApplicablePreset(advancedCatalog, entryId, presetId)) {
    return null;
  }

  return advancedCatalog.presets.find((preset) => preset.id === presetId) ?? null;
}

export function cloneProviderModelSelection(
  selection: ProviderModelSelection | null | undefined,
): ProviderModelSelection | null {
  if (!selection) {
    return null;
  }

  return {
    ...(selection.entryId ? { entryId: selection.entryId } : {}),
    entryMode: selection.entryMode,
    ...(selection.presetId ? { presetId: selection.presetId } : {}),
    ...(cloneSelectionControls(selection.controls) ? { controls: cloneSelectionControls(selection.controls) } : {}),
  };
}

export function cloneProviderModelResolution(
  resolution: ProviderModelResolution | null | undefined,
): ProviderModelResolution | null {
  if (!resolution) {
    return null;
  }

  return {
    entryId: resolution.entryId,
    model: resolution.model,
    entryMode: resolution.entryMode,
    ...(resolution.presetId ? { presetId: resolution.presetId } : {}),
    ...(cloneSelectionControls(resolution.controls) ? { controls: cloneSelectionControls(resolution.controls) } : {}),
    ...(resolution.supportTier ? { supportTier: resolution.supportTier } : {}),
    warnings: [...resolution.warnings],
  };
}

export function parseProviderModelSelection(
  value: unknown,
): ProviderModelSelection | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const entryMode = record.entryMode === 'auto' || record.entryMode === 'explicit'
    ? record.entryMode
    : null;
  if (!entryMode) {
    return null;
  }

  const controlsRecord = asRecord(record.controls);
  const controls = controlsRecord
    ? cloneSelectionControls(controlsRecord as Record<string, ProviderAdvancedControlValue>)
    : undefined;

  return {
    ...(readTrimmedString(record.entryId) ? { entryId: readTrimmedString(record.entryId)! } : {}),
    entryMode,
    ...(readTrimmedString(record.presetId) ? { presetId: readTrimmedString(record.presetId)! } : {}),
    ...(controls ? { controls } : {}),
  };
}

export function parseProviderModelResolution(
  value: unknown,
): ProviderModelResolution | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const entryMode = record.entryMode === 'auto' || record.entryMode === 'explicit'
    ? record.entryMode
    : null;
  const entryId = readTrimmedString(record.entryId);
  const model = readTrimmedString(record.model);
  if (!entryMode || !entryId || !model) {
    return null;
  }

  const controlsRecord = asRecord(record.controls);
  const controls = controlsRecord
    ? cloneSelectionControls(controlsRecord as Record<string, ProviderAdvancedControlValue>)
    : undefined;
  const supportTier = record.supportTier === 'full'
    || record.supportTier === 'entry_only'
    || record.supportTier === 'read_only'
    ? record.supportTier
    : undefined;

  return {
    entryId,
    model,
    entryMode,
    ...(readTrimmedString(record.presetId) ? { presetId: readTrimmedString(record.presetId)! } : {}),
    ...(controls ? { controls } : {}),
    ...(supportTier ? { supportTier } : {}),
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  };
}

export function createExplicitProviderModelSelection(
  model: string | null | undefined,
  options: {
    presetId?: string | null;
    controls?: Record<string, ProviderAdvancedControlValue>;
  } = {},
): ProviderModelSelection | null {
  const entryId = model?.trim();
  if (!entryId) {
    return null;
  }

  const controls = cloneSelectionControls(options.controls);

  return {
    entryId,
    entryMode: 'explicit',
    ...(options.presetId?.trim() ? { presetId: options.presetId.trim() } : {}),
    ...(controls ? { controls } : {}),
  };
}

export function sameProviderModelSelection(
  left: ProviderModelSelection | null | undefined,
  right: ProviderModelSelection | null | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  const leftControls = cloneSelectionControls(left.controls);
  const rightControls = cloneSelectionControls(right.controls);
  return left.entryMode === right.entryMode
    && (left.entryId ?? null) === (right.entryId ?? null)
    && (left.presetId ?? null) === (right.presetId ?? null)
    && JSON.stringify(leftControls ?? null) === JSON.stringify(rightControls ?? null);
}

export function resolveSelectedProviderInstance(
  provider: ProductProviderDescriptor,
  requestedInstance: string,
): string {
  const normalizedRequested = requestedInstance.trim();
  if (normalizedRequested && provider.instances.some((instance) => instance.id === normalizedRequested)) {
    return normalizedRequested;
  }

  // Before the runtime-backed provider registry arrives we may not know any instances yet.
  // Preserve the caller's current choice instead of clearing it to the empty fallback.
  if (normalizedRequested && provider.instances.length === 0) {
    return normalizedRequested;
  }

  if (normalizedRequested && provider.instances.length > 0) {
    console.warn(`Unknown provider instance "${normalizedRequested}" for ${provider.id}, falling back to default`);
  }

  return provider.defaultInstance ?? provider.instances[0]?.id ?? '';
}

export function isLegacyProviderModelTarget(input: {
  catalog: ProviderModelCatalog;
  model: string | null | undefined;
  modelSelection?: ProviderModelSelection | null;
}): boolean {
  const normalizedModel = normalizeProviderEntryAlias({
    provider: input.catalog.provider,
    backend: input.catalog.backend,
    catalog: input.catalog,
    model: input.model,
  }) ?? '';
  if (!normalizedModel || input.modelSelection) {
    return false;
  }

  return !input.catalog.models.some((option) => option.id === normalizedModel);
}

export function resolveCatalogTargetSelection(input: {
  target: ProviderTargetSelection;
  catalog: ProviderModelCatalog;
  advancedCatalog?: ProviderAdvancedModelCatalog | null;
  preserveCurrentModel: boolean;
  preserveCurrentSelection?: boolean;
}): ProviderTargetSelection {
  const normalizedTarget = normalizeTargetAliases({
    target: input.target,
    catalog: input.catalog,
    advancedCatalog: input.advancedCatalog,
  });
  const resolvedInstance = (input.catalog.instance ?? normalizedTarget.instance) || '';
  const normalizedTargetModel = normalizedTarget.model?.trim() || '';
  const hasCurrentModel = input.catalog.models.some((option) => option.id === normalizedTarget.model);
  const legacyModelTarget = isLegacyProviderModelTarget({
    catalog: input.catalog,
    model: normalizedTarget.model,
    modelSelection: normalizedTarget.modelSelection,
  });
  const resolvedModel = input.preserveCurrentModel && hasCurrentModel
    ? normalizedTarget.model
    : input.preserveCurrentModel && legacyModelTarget
      ? normalizedTargetModel
    : resolveProviderCatalogDefaultModel(input.catalog);
  if (legacyModelTarget && input.preserveCurrentModel) {
    return {
      provider: normalizedTarget.provider,
      instance: resolvedInstance,
      model: normalizedTargetModel,
      modelSelection: null,
      modelResolution: null,
    };
  }
  const advancedCatalog = input.advancedCatalog ?? null;
  const preserveCurrentSelection = input.preserveCurrentSelection ?? input.preserveCurrentModel;
  const requestedSelection = preserveCurrentSelection
    ? cloneProviderModelSelection(normalizedTarget.modelSelection)
    : cloneProviderModelSelection(advancedCatalog?.defaultSelection)
      ?? null;
  const requestedEntryId = requestedSelection?.entryId?.trim();
  const baseEntryId = requestedEntryId
    && input.catalog.models.some((option) => option.id === requestedEntryId)
    ? requestedEntryId
    : resolvedModel;
  const basePreset = resolvePreset(
    advancedCatalog,
    baseEntryId,
    requestedSelection?.presetId,
  );
  const presetPreferredEntryId = basePreset?.preferredEntryId?.trim();
  const resolvedEntryId = requestedSelection?.entryMode === 'auto'
    && presetPreferredEntryId
    && input.catalog.models.some((option) => option.id === presetPreferredEntryId)
    ? presetPreferredEntryId
    : baseEntryId;
  const resolvedPreset = resolvePreset(
    advancedCatalog,
    resolvedEntryId,
    basePreset?.id,
  );
  const controls = filterApplicableControls(
    advancedCatalog,
    resolvedEntryId,
    requestedSelection?.controls,
  );
  const resolvedSelection = requestedSelection
    ? {
        entryId: resolvedEntryId,
        entryMode: requestedSelection.entryMode,
        ...(resolvedPreset ? { presetId: resolvedPreset.id } : {}),
        ...(controls ? { controls } : {}),
      }
    : createExplicitProviderModelSelection(resolvedEntryId, {
        presetId: undefined,
        controls,
      });
  const resolvedWarnings = advancedCatalog?.warnings.length
    ? [...advancedCatalog.warnings]
    : [];

  return {
    provider: normalizedTarget.provider,
    instance: resolvedInstance,
    model: resolvedEntryId,
    modelSelection: resolvedSelection,
    modelResolution: resolvedSelection
      ? {
          entryId: resolvedEntryId,
          model: resolvedEntryId,
          entryMode: resolvedSelection.entryMode,
          ...(resolvedPreset ? { presetId: resolvedPreset.id } : {}),
          ...(controls ? { controls } : {}),
          ...(advancedCatalog ? { supportTier: advancedCatalog.support.tier } : {}),
          warnings: resolvedWarnings,
        }
      : null,
  };
}
