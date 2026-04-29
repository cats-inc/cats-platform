# ADR-093: Use Platform Language Preferences for Assistant Responses and UI Locales

> Add two language preferences at the platform level: one policy for assistant
> response language across Chat / Code / Work / Guide Cat, and one locale
> preference for Cats UI chrome. Keep the two preferences separate because they
> control different systems.

## Status

Proposed

## Date

2026-04-29

## Context

The owner wants two new Settings options:

1. **Assistant response language**: `Unspecified` (default), `English`,
   `Traditional Chinese`.
2. **Cats UI display language**: `Auto-detect` (default), `English`,
   `Traditional Chinese`.

The first preference controls model-facing behavior. It should influence how
assistant replies are requested from runtime/provider paths across all product
surfaces:

- Chat
- Code
- Work
- Guide Cat assist surfaces

The second preference controls renderer chrome: navigation, Settings, buttons,
empty states, tooltips, toast text, setup wizard copy, product sidebars, and
other Cats-owned UI strings. It must not translate user messages, assistant
messages already in transcripts, provider/model names, file paths, code,
terminal output, runtime logs, or protocol identifiers.

The current Settings architecture has two relevant layers:

- **Settings composition** (`SettingsSection`, `SettingsOptionRow`, etc.) is
  suitable for adding a single visible Settings location. General Settings
  already holds platform-wide profile and lobby preferences that apply across
  products.
- **Settings persistence** is split today. `/api/platform/preferences` owns
  platform shell preferences such as lobby motion and desktop startup behavior,
  while `/api/preferences` owns Chat-state preferences such as selected
  channel, conversation behavior, new-chat defaults, advanced draft controls,
  and folder browse memory. Guide Cat placement preferences were intentionally
  moved to a renderer-owned local store by PLAN-063 because those fields are
  UI placement state, not server-owned platform policy.

That means the current visual Settings structure is suitable, but the language
settings must not be bolted onto a product-local preference store. The assistant
response language has cross-product semantic impact, and UI locale is a
platform-shell rendering concern. Both need one canonical platform preference
boundary so Chat / Code / Work / Guide Cat can read the same value without
duplicating product-specific settings.

## Decision

Adopt a platform-level language preference contract in `platform-preferences`
and expose it through the app-shell payload.

Persist these values:

```ts
type AssistantResponseLanguage = 'unspecified' | 'en' | 'zh-TW';
type UiLanguagePreference = 'auto' | 'en' | 'zh-TW';

interface PlatformLanguagePreferences {
  assistantResponseLanguage: AssistantResponseLanguage;
  uiLanguage: UiLanguagePreference;
}
```

Expose these values to the renderer:

```ts
interface PlatformLanguageState extends PlatformLanguagePreferences {
  resolvedUiLanguage: 'en' | 'zh-TW';
}
```

The persisted defaults are:

- `assistantResponseLanguage: 'unspecified'`
- `uiLanguage: 'auto'`

`resolvedUiLanguage` is computed at app-shell read time or renderer bootstrap
time from the persisted UI language preference plus the current browser /
Electron locale list. Because only English and Traditional Chinese are in
scope, any Chinese locale detected by `Auto-detect` resolves to `zh-TW`; all
other unmatched locales resolve to `en`.

### Assistant Response Language

Assistant response language is a product/runtime prompt policy, not an i18n
setting.

- `unspecified` emits no extra language instruction.
- `en` adds a shared instruction equivalent to "Reply to the user in English
  unless the user explicitly asks for another language."
- `zh-TW` adds a shared instruction equivalent to "Reply to the user in
  Traditional Chinese unless the user explicitly asks for another language."

The shared helper that builds this instruction must live outside any one
product surface and must be consumed by Chat, Code, Work, and Guide Cat dispatch
paths. Explicit user instructions in a turn remain higher priority than the
platform default language policy.

### Cats UI Display Language

UI display language is a renderer localization concern.

- Use stable message IDs and locale catalogs for `en` and `zh-TW`.
- Use a typed internal i18n layer rather than adding a heavy localization
  dependency in the first slice.
- Wrap the renderer in an i18n provider that reads `payload.language`.
- Update `document.documentElement.lang` and the app title when the resolved
  locale changes.
- Extract Cats-owned static UI strings aggressively across the desktop renderer.
- Do not translate transcript content, provider output, file paths, code, logs,
  route paths, API field names, enum values, or configuration keys.

The Settings UI should present both preferences in one **Language** section in
General Settings. The labels shown to users are:

- Assistant response language: `Unspecified`, `English`, `繁體中文`
- Cats UI display language: `Auto-detect`, `English`, `繁體中文`

Settings save feedback must follow SPEC-073: no inline success/error feedback;
use existing toast behavior for errors and stay silent on successful changes
when the selected value already reflects the new state.

## Consequences

### Positive

- One visible Settings location can control language behavior for every product
  surface.
- The assistant language policy stays independent from UI locale. A user can
  run the UI in English while asking assistants to answer in Traditional
  Chinese, or leave assistant behavior unspecified while localizing the UI.
- The contract fits the existing platform preference boundary and does not
  pollute Chat-local preferences or renderer-only Guide Cat placement state.
- Future mobile Settings can consume the same platform language preference
  contract.
- Typed catalogs give agents a concrete path for broad string extraction and
  coverage checks.

### Negative

- Broad UI localization is a large renderer migration. A partial pass will be
  visible immediately because untranslated English strings will sit beside
  localized chrome.
- Server-generated user-visible messages need careful handling. Some existing
  responses are plain English strings; they must either become typed renderer
  messages or remain explicit fallbacks during the migration.
- Tests must grow around catalog key coverage and language-policy dispatch, not
  just Settings rendering.

### Neutral

- This ADR does not choose a third-party i18n library. A dependency can be
  revisited if pluralization, ICU formatting, or translator tooling becomes a
  real need.
- Historical transcripts are not rewritten when preferences change.
- Provider/model names remain source labels, not translated UI copy.

## Alternatives Considered

### Store Assistant Response Language in Chat Preferences

- **Pros**: `/api/preferences` already supports Chat behavior patches and is
  consumed by product renderers.
- **Cons**: The setting must apply to Code, Work, and Guide Cat. Storing it in
  Chat state makes the owner-facing "one place controls all products" promise
  false and increases product coupling.
- **Why rejected**: The language policy is platform-wide behavior, not
  Chat-local behavior.

### Store UI Language in Renderer-Only Local Storage

- **Pros**: Fastest to implement; avoids server/API changes.
- **Cons**: Desktop host, web renderer, future mobile client, and app-shell
  bootstrap would not share one durable source. It also repeats the Guide Cat
  UI preference pattern in a place where the preference should be portable.
- **Why rejected**: UI language is a user/account-level preference for the
  platform shell, not transient placement state.

### Couple Assistant Response Language to UI Locale

- **Pros**: One setting instead of two; simple mental model for users who want
  everything in one language.
- **Cons**: The owner explicitly wants separate concepts. Model response
  language and UI chrome language are operationally different. Coupling them
  would prevent common workflows such as English UI with Traditional Chinese
  assistant replies.
- **Why rejected**: The two preferences control different systems and need
  independent defaults.

### Add a Full i18n Dependency Immediately

- **Pros**: Mature formatting features, ecosystem tooling, and translator
  workflow support.
- **Cons**: Initial scope is two locales and mostly static product chrome.
  Adding a new dependency before proving the extraction surface conflicts with
  the project's dependency-light posture.
- **Why rejected for the first slice**: A typed internal catalog is enough for
  this rollout. Revisit once pluralization and external translator workflow are
  proven needs.

## References

- [SPEC-097: Platform Language Settings and UI Localization](../specs/SPEC-097-platform-language-settings-and-ui-localization.md)
- [PLAN-086: Platform Language Settings and UI Localization Rollout](../plans/PLAN-086-platform-language-settings-and-ui-localization-rollout.md)
- [ADR-052: Use Canonical Platform Settings Routes Inside Product Shells](./052-use-canonical-platform-settings-routes-inside-product-shells.md)
- [ADR-072: Settings Composition Layer in `src/design/`](./072-settings-composition-layer-in-design.md)
- [SPEC-073: Settings UI Composition Layer](../specs/SPEC-073-settings-composition-layer.md)
- [PLAN-063: Guide Cat Renderer-Owned UI Preferences Migration](../plans/PLAN-063-guide-cat-renderer-owned-ui-preferences-migration.md)

---

*Decision made: 2026-04-29*
*Decision makers: user, Codex*
