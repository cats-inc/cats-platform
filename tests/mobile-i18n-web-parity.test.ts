import assert from 'node:assert/strict';
import test from 'node:test';

import { enCatalog } from '../src/shared/i18n/catalogs/en.ts';
import { zhTWCatalog } from '../src/shared/i18n/catalogs/zh-TW.ts';
import {
  getMobileProductSidebarCopy,
  getMobileSettingsCopy,
  getMobileTabsCopy,
  type MobileLocale,
} from '../src/mobile/index.ts';

/**
 * Drift-detection between the mobile narrow runtime catalog
 * (`src/mobile/i18n.ts`) and the web full catalog
 * (`src/shared/i18n/catalogs/{en,zh-TW}.ts`).
 *
 * Mobile imports the web catalogs at module init and reads the
 * mirrored strings directly — see `src/mobile/i18n.ts:1-3` for the
 * `enCatalog / zhTWCatalog` import. That makes drift impossible
 * for the live runtime read: if a web key is renamed, `tsc`
 * errors at the mobile read site; if the value changes, mobile
 * picks it up automatically.
 *
 * What this test still buys you:
 *
 *   1. Catches a regression where someone reverts a mirrored
 *      string back to a hardcoded literal (intentional or
 *      otherwise).
 *   2. Documents the explicit mobile-to-web key mapping for code
 *      review — easier to audit "is this the right web key?" than
 *      to grep through `src/mobile/i18n.ts`.
 *   3. Pre-flight parity check during a planned web key rename:
 *      run this test against a staged catalog change to see
 *      what mobile would render, before pushing the rename
 *      anywhere.
 *
 * Reviewer's underlying ask:
 *
 * > 我真的非常不希望看到 web 字串改了, mobile (因為是另外一份)卻又漏掉的情況.
 *
 * Bundle trade-off: importing the web catalog adds ~200 KB of
 * Hermes bytecode (full ~3000 keys × 2 locales). On a 5 MB mobile
 * bundle that's ~4 % overhead, which we accepted in exchange for
 * the drift safety. If a future audit shows the mobile bundle
 * needs to shrink, the alternative is splitting the web catalog
 * into a shared `core/` (used by both) plus a `desktop-extended/`
 * (web-only) — see the proposal at the top of
 * `tests/mobile-i18n-web-parity.test.ts`'s history (commit
 * 82f8f0597's message) for that contingency plan.
 *
 * Keep the mapping below in lockstep with the comments / doc strings
 * in `src/mobile/i18n.ts` that say "mirrors web …" — every such
 * comment should have a matching row here.
 */

interface ParityRow {
  /** Path inside the mobile copy object (used to read the value). */
  mobile: (locale: MobileLocale) => string;
  /** Web catalog key. */
  webKey: keyof typeof enCatalog & keyof typeof zhTWCatalog;
  /** Short label shown in test failure messages. */
  label: string;
}

const PARITY_ROWS: ParityRow[] = [
  // Settings → Language card. Source comment in
  // `src/mobile/i18n.ts` (`MobileSettingsCopy` declarations) says
  // "Strings mirror the web Settings → General language card …".
  {
    label: 'MobileSettingsCopy.languageSection',
    mobile: (locale) => getMobileSettingsCopy(locale).languageSection,
    webKey: 'settings.general.languageTitle',
  },
  {
    label: 'MobileSettingsCopy.languagePreferenceLabel',
    mobile: (locale) => getMobileSettingsCopy(locale).languagePreferenceLabel,
    webKey: 'settings.general.languagePreferenceLabel',
  },
  {
    label: 'MobileSettingsCopy.languageAutoLabel',
    mobile: (locale) => getMobileSettingsCopy(locale).languageAutoLabel,
    webKey: 'settings.general.languageAutoOption',
  },
  {
    label: 'MobileSettingsCopy.languageEnglishLabel',
    mobile: (locale) => getMobileSettingsCopy(locale).languageEnglishLabel,
    webKey: 'settings.general.languageEnglishOption',
  },
  {
    label: 'MobileSettingsCopy.languageTraditionalChineseLabel',
    mobile: (locale) =>
      getMobileSettingsCopy(locale).languageTraditionalChineseLabel,
    webKey: 'settings.general.languageTraditionalChineseOption',
  },
  // Settings page title — the user-visible heading on the Settings
  // tab. Mobile + web both show the same word; pin it.
  {
    label: 'MobileSettingsCopy.settingsTitle',
    mobile: (locale) => getMobileSettingsCopy(locale).settingsTitle,
    webKey: 'settings.shell.heading',
  },
  // DIRECT MESSAGES section header on the Chat tab. Comment in
  // `src/mobile/i18n.ts` says "Mirrors web's
  // `conversationSidebarDirectMessagesLabel`".
  {
    label: 'MobileProductSidebarCopy.directMessagesLabel',
    mobile: (locale) => getMobileProductSidebarCopy(locale).directMessagesLabel,
    webKey: 'conversationSidebar.directMessagesLabel',
  },
];

const LOCALES: MobileLocale[] = ['en', 'zh-TW'];

for (const row of PARITY_ROWS) {
  for (const locale of LOCALES) {
    test(`mobile i18n parity: ${row.label} (${locale}) matches web ${row.webKey}`, () => {
      const mobileValue = row.mobile(locale);
      const webCatalog = locale === 'en' ? enCatalog : zhTWCatalog;
      const webValue = webCatalog[row.webKey];
      assert.equal(
        mobileValue,
        webValue,
        `Mobile '${row.label}' (${locale}) should mirror web '${row.webKey}' (${locale}). `
          + `Mobile says: ${JSON.stringify(mobileValue)}. `
          + `Web says: ${JSON.stringify(webValue)}. `
          + 'Either update the mobile copy in src/mobile/i18n.ts to match web, '
          + 'or revise the mapping in tests/mobile-i18n-web-parity.test.ts if the divergence is intentional.',
      );
    });
  }
}

// `MobileTabsCopy.tabTitle.settings` is the bottom-tab rail label
// for the Settings tab. Web doesn't render an equivalent (web has
// its own settings panel chrome), so we don't pin parity. Just make
// sure both locales ship something sensible.
test('mobile tabs copy ships a Settings tab label in both locales', () => {
  for (const locale of LOCALES) {
    const tabs = getMobileTabsCopy(locale);
    assert.ok(
      typeof tabs.tabTitle.settings === 'string' && tabs.tabTitle.settings.length > 0,
      `MobileTabsCopy.tabTitle.settings must be a non-empty string for ${locale}.`,
    );
  }
});
