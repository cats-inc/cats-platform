import type {
  PlatformProductDescriptor,
  PlatformProductSettingsDescriptor,
} from '../../shared/platform-contract.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../shared/i18n/index.js';

export type PlatformProductCopyTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

interface PlatformProductCopyKeys {
  nameKey: MessageKey;
  subtitleKey: MessageKey;
  settingsLabelKey: MessageKey;
}

const defaultPlatformProductCopyTranslator = createTranslator('en');

const PLATFORM_PRODUCT_COPY_BY_ID: Partial<
  Record<PlatformProductDescriptor['id'], PlatformProductCopyKeys>
> = {
  chat: {
    nameKey: messageKeys.platformProductChatName,
    subtitleKey: messageKeys.platformProductChatSubtitle,
    settingsLabelKey: messageKeys.platformProductChatSettingsLabel,
  },
  code: {
    nameKey: messageKeys.platformProductCodeName,
    subtitleKey: messageKeys.platformProductCodeSubtitle,
    settingsLabelKey: messageKeys.platformProductCodeSettingsLabel,
  },
  work: {
    nameKey: messageKeys.platformProductWorkName,
    subtitleKey: messageKeys.platformProductWorkSubtitle,
    settingsLabelKey: messageKeys.platformProductWorkSettingsLabel,
  },
};

function resolvePlatformProductCopyKeys(
  productId: PlatformProductDescriptor['id'],
): PlatformProductCopyKeys | null {
  return PLATFORM_PRODUCT_COPY_BY_ID[productId] ?? null;
}

export function resolvePlatformProductDisplayName(
  product: PlatformProductDescriptor,
  t: PlatformProductCopyTranslator = defaultPlatformProductCopyTranslator,
): string {
  const copyKeys = resolvePlatformProductCopyKeys(product.id);
  return copyKeys ? t(copyKeys.nameKey) : product.productName;
}

export function resolvePlatformProductSubtitle(
  product: PlatformProductDescriptor,
  t: PlatformProductCopyTranslator = defaultPlatformProductCopyTranslator,
): string {
  const copyKeys = resolvePlatformProductCopyKeys(product.id);
  return copyKeys ? t(copyKeys.subtitleKey) : product.subtitle;
}

export function resolvePlatformProductSettingsLabel(
  productId: PlatformProductDescriptor['id'],
  entry: PlatformProductSettingsDescriptor,
  t: PlatformProductCopyTranslator = defaultPlatformProductCopyTranslator,
): string {
  const copyKeys = resolvePlatformProductCopyKeys(productId);
  return copyKeys && entry.id === productId ? t(copyKeys.settingsLabelKey) : entry.label;
}
