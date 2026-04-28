import type { ProviderAdvancedControlValue } from '../../shared/providerCatalog.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';

export const DEFAULT_PROVIDER_CAPABILITY_CONTROL_KEY = 'default';

export interface ProviderCapabilityControlKeyInput {
  control?: string | null;
  modelSelection?: ProviderModelSelection | null;
}

export function createProviderCapabilityControlKey(
  input: ProviderCapabilityControlKeyInput,
): string {
  const explicitControl = normalizeControlString(input.control);
  if (explicitControl) {
    return explicitControl;
  }

  const controls = input.modelSelection?.controls;
  if (!controls) {
    return DEFAULT_PROVIDER_CAPABILITY_CONTROL_KEY;
  }

  const entries = Object.entries(controls)
    .map(([key, value]) => normalizeControlEntry(key, value))
    .filter((entry): entry is [string, string] => entry !== null)
    .sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return DEFAULT_PROVIDER_CAPABILITY_CONTROL_KEY;
  }

  return entries.map(([key, value]) => `${key}=${value}`).join(';');
}

function normalizeControlEntry(
  key: string,
  value: ProviderAdvancedControlValue,
): [string, string] | null {
  const normalizedKey = normalizeControlString(key);
  if (!normalizedKey) {
    return null;
  }

  const normalizedValue = normalizeControlValue(value);
  if (!normalizedValue) {
    return null;
  }

  return [normalizedKey, normalizedValue];
}

function normalizeControlString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeControlValue(value: ProviderAdvancedControlValue): string | null {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }

  return normalizeControlString(value);
}
