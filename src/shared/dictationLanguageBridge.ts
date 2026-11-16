// SPEC-146 FR-7: the dictation language bridge. Mirrors
// desktop/host/contracts.ts DesktopDictationLanguageOptions.

export const DICTATION_LANGUAGE_AUTO = 'auto';

export interface DictationLanguageOptions {
  /** What Automatic means: detection from speech (Linux) or the system language. */
  automatic: 'detect' | 'system';
  /** macOS and Windows: the language Automatic uses, when the helper reports it. */
  system?: string;
  /** The languages this machine can dictate, besides Automatic. */
  options: string[];
  /** The saved value: `"auto"` or a tag, which may no longer be among `options`. */
  value: string;
}

export interface DictationLanguageBridge {
  getDictationLanguageOptions: () => Promise<DictationLanguageOptions>;
  setDictationLanguage: (value: string) => Promise<void>;
}
