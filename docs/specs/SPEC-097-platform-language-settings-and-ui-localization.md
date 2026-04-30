# SPEC-097: Platform Language Settings and UI Localization

> Define the two language settings requested for Cats Settings and the
> localization contract for extracting Cats-owned UI strings across the product
> shell.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | user |
| **Reviewer** | Codex |

## Summary

Cats Settings needs one **Language** section with two independent preferences:
assistant response language and Cats UI display language. Assistant response
language is a shared prompt policy consumed by Chat, Code, Work, and Guide Cat.
UI display language is a renderer localization setting that switches Cats-owned
chrome between auto-detected locale, English, and Traditional Chinese.

The existing Settings composition architecture is suitable for the visible UI:
General Settings already hosts platform-wide profile and lobby preferences, and
`SettingsSection` / `SettingsOptionRow` are the right primitives. The persistence
architecture needs a platform-level extension: these preferences belong in
`platform-preferences`, not in Chat-local `/api/preferences` and not in the
renderer-only Guide Cat UI preference store.

## Goals

- Add one General Settings **Language** section with both requested controls.
- Persist both language preferences once at the platform level.
- Expose language state through the app-shell payload so all product renderers
  can consume it consistently.
- Apply assistant response language to Chat, Code, Work, and Guide Cat prompt
  construction from one shared helper.
- Localize Cats-owned UI chrome through a typed internal i18n catalog for
  `en` and `zh-TW`.
- Extract as many user-visible strings as practical in one planned pass, with a
  written allowlist for strings that must remain raw.

## Non-Goals

- No automatic translation of user messages, assistant transcript content,
  uploaded files, code blocks, terminal output, provider output, or historical
  conversations.
- No runtime/provider-level translation service.
- No Simplified Chinese catalog in this slice.
- No third-party i18n dependency in the first implementation pass.
- No server-side HTML rendering or locale negotiation beyond app-shell language
  state.
- No migration of protocol identifiers, route paths, API field names, enum
  values, config keys, CSS class names, test IDs, logs, or telemetry event names
  into translated strings.
- No extraction of API-internal fallback messages, query-client internal
  fallback strings, HTTP method names, diagnostic/debug text, trace text, or
  internal status/enum labels unless they are deliberately rendered as
  user-facing product chrome.

## Current Architecture Assessment

The current Settings **UI** architecture is appropriate:

- `PlatformSettingsGeneral` already edits platform-wide settings.
- The Settings composition layer from SPEC-073 supports radio-row style options
  without adding new primitives.
- The feedback convention is already defined: errors use toast, successful
  value changes can stay silent.

The current Settings **state** architecture needs a deliberate extension:

- `/api/platform/preferences` is the correct durable boundary because the
  values are platform-wide.
- `/api/preferences` is not correct because it is Chat-state scoped.
- `GuideCatUiPrefsStore` is not correct because language must survive as a
  portable platform preference, not a renderer-only placement preference.
- `Cats Core v1` should not grow these fields; they are platform shell
  preferences, not shared domain records.

## User Stories

- As the owner, I want assistants to answer in my preferred language across
  Chat, Code, Work, and Guide Cat from one setting.
- As the owner, I want Cats UI chrome to display in Auto-detect, English, or
  Traditional Chinese without changing assistant behavior.
- As an agent implementing localization, I want a clear extraction plan so I
  can move static UI strings into catalogs without accidentally translating
  transcripts, code, or protocol values.

## Requirements

### Functional Requirements

- **FR-1**: Add platform language preference types:
  - `AssistantResponseLanguage = 'unspecified' | 'en' | 'zh-TW'`
  - `UiLanguagePreference = 'auto' | 'en' | 'zh-TW'`
  - `ResolvedUiLanguage = 'en' | 'zh-TW'`
- **FR-2**: Persist these defaults:
  - `assistantResponseLanguage: 'unspecified'`
  - `uiLanguage: 'auto'`
- **FR-3**: Normalize invalid persisted values back to defaults rather than
  throwing during app bootstrap.
- **FR-4**: Extend `/api/platform/preferences` so POST accepts
  `assistantResponseLanguage` and `uiLanguage`; invalid values return `400`
  with a structured error.
- **FR-5**: Extend app-shell payload with a `language` object:

  ```ts
  interface PlatformLanguageState {
    assistantResponseLanguage: AssistantResponseLanguage;
    uiLanguage: UiLanguagePreference;
    resolvedUiLanguage: ResolvedUiLanguage;
    supportedUiLanguages: ['en', 'zh-TW'];
  }
  ```

- **FR-6**: Resolve `uiLanguage: 'auto'` from the current renderer locale list:
  - any `zh` locale resolves to `zh-TW` because Traditional Chinese is the only
    Chinese UI catalog in scope
  - any `en` locale resolves to `en`
  - all other locales resolve to `en`
- **FR-7**: Add one **Language** section to General Settings with two option
  groups:
  - Assistant response language: `Unspecified`, `English`, `繁體中文`
  - Cats UI display language: `Auto-detect`, `English`, `繁體中文`
- **FR-8**: The two option groups must be independent. Changing UI language
  must not change assistant response language, and changing assistant response
  language must not change UI language.
- **FR-9**: General Settings must use existing Settings primitives and must not
  render inline feedback. Use toast only for failed saves.
- **FR-10**: Add a shared assistant language policy helper that converts
  `assistantResponseLanguage` into a prompt instruction:
  - `unspecified`: no instruction
  - `en`: reply in English unless the user explicitly asks otherwise
  - `zh-TW`: reply in Traditional Chinese unless the user explicitly asks
    otherwise
- **FR-11**: Chat, Code, Work, and Guide Cat dispatch paths must consume the
  same helper. Product surfaces must not hand-write their own prompt text.
- **FR-12**: Explicit user instructions in the current turn override the
  platform default assistant response language.
- **FR-13**: Add a typed internal i18n layer with stable message IDs, English
  and Traditional Chinese catalogs, and a React hook/provider for renderers.
- **FR-14**: Catalog key coverage must be testable. Missing keys in either
  locale fail a targeted test.
- **FR-15**: The renderer must update the root `lang` attribute and document
  title when `resolvedUiLanguage` changes.
- **FR-16**: Format dates/times/counts through locale-aware helpers where the
  UI currently renders Cats-owned formatted text.
- **FR-17**: Extract Cats-owned static UI strings from these desktop renderer
  areas unless explicitly allowlisted:
  - platform shell and route chrome
  - Lobby
  - Settings pages
  - setup wizard
  - Guide Cat sidecar / dock / assist panels
  - shared product shell sidebar and recents
  - Chat renderer chrome
  - Code renderer chrome
  - Work renderer chrome
  - shared design components that render user-visible text, aria labels, or
    tooltips
- **FR-18**: Extract user-visible renderer error/toast text only when the
  message is Cats-owned, deterministic, and intentionally shown to the owner.
  API/query helper fallback strings are implementation details by default and
  must not be treated as localization work.
- **FR-19**: Known server-originated UI status/error messages that are
  deliberately rendered as product chrome should be converted to message keys
  or mapped to renderer messages. Unknown server errors and internal transport
  exceptions may remain raw fallbacks.
- **FR-20**: Add a written raw-string allowlist for categories intentionally
  not localized.

### Non-Functional Requirements

- **No dev-state pollution**: validation must use tests, source inspection, or
  existing state reads. Do not create demo chats, tasks, runs, cats, or other
  persisted records.
- **Accessibility**: localized strings must preserve `aria-label`,
  `aria-describedby`, button names, and tooltip semantics.
- **Layout**: English and Traditional Chinese strings must fit existing buttons,
  tabs, sidebars, cards, and Settings rows at desktop and narrow widths.
- **Performance**: locale switching should not require a full page reload and
  should not fetch remote catalogs.
- **Layering**: `src/design/**` must not import app/product code. Shared i18n
  types/catalog helpers may be imported by design components only if they stay
  product-agnostic.
- **TypeScript**: no `any`; use strict typed catalog keys and `interface` for
  object shapes where applicable.

## Design Overview

### Preference Flow

```text
platform-preferences.json
        |
        v
readPlatformPreferences()
        |
        v
createAppShell() -> payload.language
        |
        +--> Settings General controls
        |
        +--> I18nProvider -> renderer UI strings
        |
        +--> assistant language policy helper -> dispatch prompts
```

### Settings Placement

General Settings gets a new **Language** section after Profile and before Lobby
motion. It contains two radio groups rendered with `SettingsOptionRow asChoice`.
The UI can use a single save handler per preference:

```ts
POST /api/platform/preferences
{
  "assistantResponseLanguage": "zh-TW"
}
```

```ts
POST /api/platform/preferences
{
  "uiLanguage": "en"
}
```

The response returns normalized platform preferences. The renderer updates the
app-shell payload optimistically and refetches or refreshes the envelope after
successful saves, matching existing platform preference patterns.

### UI Localization Layer

Recommended first-slice shape:

```text
src/shared/i18n/
  languages.ts
  messageKeys.ts
  catalogs/en.ts
  catalogs/zh-TW.ts
  format.ts
  index.ts

src/app/renderer/i18n/
  I18nProvider.tsx
  useI18n.ts
```

Message IDs should be stable and namespaced by surface, for example:

```ts
'settings.general.language.title'
'settings.general.language.assistantResponse.unspecified.label'
'settings.general.language.ui.auto.description'
'chat.composer.send.ariaLabel'
'productSidebar.recents.title'
```

The English catalog is the source-of-truth text for existing copy. The
Traditional Chinese catalog should use Taiwan Traditional Chinese wording and
avoid mixing Simplified Chinese terms.

### Assistant Language Policy

Recommended helper shape:

```ts
interface AssistantLanguagePolicy {
  language: AssistantResponseLanguage;
  instruction: string | null;
}

function resolveAssistantLanguagePolicy(
  language: AssistantResponseLanguage,
): AssistantLanguagePolicy;
```

Consumers append the returned instruction to product-owned system/developer
prompt assembly only when `instruction` is non-null. The helper must be consumed
at dispatch construction time so it affects newly generated replies only.

## String Extraction Rules

These rules define the work boundary. Agents must not count excluded categories
as localization debt or progress, even when raw-string scans find English
literals in those categories.

### Must Localize

- Static headings, labels, descriptions, button text, tabs, menu items, sidebar
  labels, empty states, status chips, badges, tooltips, `aria-label`s, and
  Cats-owned toasts.
- Deterministic validation errors shown in Settings or setup flows.
- Product chrome inside Chat / Code / Work, including composer controls and
  product-specific draft controls.
- Guide Cat UI chrome, including panel labels and quick actions.

### Must Not Localize

- User-authored messages and assistant transcript content.
- Cat names, owner name, provider names, model IDs, branch names, file paths,
  URLs, command strings, code snippets, terminal output, git output, logs, and
  trace payloads.
- API field names, enum values, route names, CSS class names, storage keys,
  feature flag keys, test IDs, and telemetry event names.
- HTTP method names, request/response route constants, query keys, cache keys,
  record type strings, metadata keys, and other protocol/config identifiers.
- API-internal fallback messages, query-client internal fallback strings,
  console/debug diagnostics, developer-only diagnostics, stack traces, and
  smoke/test-only strings.
- Internal status/enum mapping labels used only to choose CSS classes, record
  states, metrics, debug traces, or transport metadata. Localize only the
  separate display label that is intentionally rendered to the owner.
- Markdown content generated by assistants unless it is a Cats-owned template.

### May Remain Raw Initially With Allowlist

- Unknown server error messages and low-level transport exceptions.
- Developer diagnostics hidden behind debug-only surfaces.
- Highly dynamic runtime status text when the source does not yet provide a
  stable code/key.
- Third-party copy returned by external services.

## Dependencies

- ADR-093 for the platform preference ownership decision.
- SPEC-073 / PLAN-065 for Settings composition and feedback conventions.
- Existing `/api/platform/preferences` route.
- Existing app-shell payload normalization.

## Acceptance Criteria

- General Settings displays exactly the requested options for both language
  preferences.
- Persisted `platform-preferences.json` stores normalized language preferences.
- `GET /api/app-shell` exposes `payload.language`.
- UI chrome can be switched between English and Traditional Chinese without a
  full reload.
- `Auto-detect` resolves deterministically and falls back to English when no
  supported locale is detected.
- Chat, Code, Work, and Guide Cat use the same assistant response language
  helper.
- Catalog coverage tests fail if `en` and `zh-TW` keys diverge.
- A final extraction audit documents remaining raw strings and why they remain.

## Open Questions

- [ ] Should future Simplified Chinese support become `zh-CN` or should `zh`
      remain an alias to Traditional Chinese only until a separate catalog
      exists?
- [ ] Should server routes eventually accept an `Accept-Language` header for
      non-renderer clients, or is app-shell language state enough for the
      desktop/mobile product clients?
- [ ] Should assistant response language apply to generated artifact comments
      and code review summaries, or only conversational replies?

## References

- [ADR-093: Use Platform Language Preferences for Assistant Responses and UI Locales](../decisions/093-use-platform-language-preferences-for-assistant-and-ui-locales.md)
- [PLAN-086: Platform Language Settings and UI Localization Rollout](../plans/PLAN-086-platform-language-settings-and-ui-localization-rollout.md)
- [SPEC-073: Settings UI Composition Layer](./SPEC-073-settings-composition-layer.md)
- [PLAN-065: Settings Composition Layer Rollout](../plans/PLAN-065-settings-composition-layer-rollout.md)
- [PLAN-063: Guide Cat Renderer-Owned UI Preferences Migration](../plans/PLAN-063-guide-cat-renderer-owned-ui-preferences-migration.md)

---

*Created: 2026-04-29*
*Author: Codex*
*Related Plan: [PLAN-086](../plans/PLAN-086-platform-language-settings-and-ui-localization-rollout.md)*
