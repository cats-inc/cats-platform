// What Settings > Desktop > Voice input says (SPEC-146 FR-6).

export const VOICE_INPUT_SECTION_ID = 'voice-input';
export const VOICE_INPUT_SETTINGS_PATH = `/settings/desktop#${VOICE_INPUT_SECTION_ID}`;
export const VOICE_INPUT_LANGUAGE_SELECT_ID = 'voice-input-dictation-language';

/**
 * A language's own name, in that language: "中文（台灣）", "English (United
 * States)". A tag the runtime cannot name stays as the tag.
 */
export function dictationLanguageName(tag: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: 'language', languageDisplay: 'standard' }).of(tag)
      ?? tag;
  } catch {
    return tag;
  }
}

/** Scrolls a section of the current Settings page into view; same-route links need no navigation. */
export function scrollToSettingsSection(sectionId: string, focusId?: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.getElementById(sectionId)?.scrollIntoView?.({ block: 'start' });
  if (focusId) {
    document.getElementById(focusId)?.focus({ preventScroll: true });
  }
}
