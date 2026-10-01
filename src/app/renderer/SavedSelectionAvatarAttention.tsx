import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { AvatarSelectionAttention } from '../../design/components/SelectionAttentionBadge.js';
import { messageKeys } from '../../shared/i18n/index.js';
import { useI18n } from './i18n/useI18n.js';
import {
  readModelSettingsFocusState,
  scrollModelSettingsFieldIntoView,
  useOpenCatlasModelSettings,
  useOpenCatModelSettings,
  useSavedSelectionAttention,
  type SavedSelectionCatalogReader,
  type SavedSelectionTarget,
} from './savedSelectionAttention.js';

/**
 * Marks a saved cat's avatar when its model choice is no longer offered; a
 * click on the marked avatar opens that cat's model field in Settings.
 */
export function CatAvatarSelectionAttention(input: {
  catId: string;
  target: SavedSelectionTarget | null;
  reader?: SavedSelectionCatalogReader;
}) {
  const attention = useSavedSelectionAttention(input.target, input.reader);
  return attention ? <CatAvatarSettingsLink catId={input.catId} attention={attention} /> : null;
}

function CatAvatarSettingsLink(input: { catId: string; attention: string }) {
  const { t } = useI18n();
  const openCatModelSettings = useOpenCatModelSettings();
  return (
    <AvatarSelectionAttention
      hint={`${input.attention} ${t(messageKeys.sharedProviderModelAttentionChooseInSettings)}`}
      onOpen={() => openCatModelSettings(input.catId)}
    />
  );
}

/** The same mark for Catlas, whose model field is on the Assistants settings page. */
export function CatlasAvatarSelectionAttention(input: {
  target: SavedSelectionTarget | null;
  reader?: SavedSelectionCatalogReader;
}) {
  const attention = useSavedSelectionAttention(input.target, input.reader);
  return attention ? <CatlasSettingsLink attention={attention} /> : null;
}

function CatlasSettingsLink(input: { attention: string }) {
  const { t } = useI18n();
  const openCatlasModelSettings = useOpenCatlasModelSettings();
  return (
    <AvatarSelectionAttention
      hint={`${input.attention} ${t(messageKeys.sharedProviderModelAttentionChooseInSettings)}`}
      onOpen={openCatlasModelSettings}
    />
  );
}

/** Shows a settings page's model field when a marked avatar opened the page. */
export function ModelSettingsFocusOnArrival() {
  const location = useLocation();
  const focus = readModelSettingsFocusState(location.state);
  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(scrollModelSettingsFieldIntoView);
    return () => cancelAnimationFrame(frame);
    // One scroll per navigation entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  return null;
}
