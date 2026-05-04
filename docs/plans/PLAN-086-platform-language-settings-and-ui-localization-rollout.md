# PLAN-086: Platform Language Settings and UI Localization Rollout

> Implementation plan for adding assistant response language and Cats UI
> display language settings, then extracting Cats-owned UI strings into typed
> English and Traditional Chinese catalogs.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | user |
| **Reviewer** | Codex |

## Related Spec

[SPEC-097: Platform Language Settings and UI Localization](../specs/SPEC-097-platform-language-settings-and-ui-localization.md)

Related ADR:

[ADR-093: Use Platform Language Preferences for Assistant Responses and UI Locales](../decisions/093-use-platform-language-preferences-for-assistant-and-ui-locales.md)

## Overview

This rollout has two tracks that must meet at one General Settings section:

1. A platform preference contract for assistant response language and UI
   language.
2. A renderer i18n migration that extracts Cats-owned UI strings into English
   and Traditional Chinese catalogs.

The Settings UI architecture is already a good fit. The implementation should
extend platform preferences and app-shell state, then migrate renderer strings
in broad but reviewable slices. Do not create persisted demo records for
verification.

## Preconditions for the Implementing Agent

- Read `AGENTS.md`, `CODEX.md` or your agent-specific file, and
  `docs/AGENT-GUIDE.md`.
- Read SPEC-097 and ADR-093 before editing source.
- Run `git status --short` before edits and do not overwrite unrelated user
  work.
- Do not write demo chats, cats, tasks, runs, or verification records into the
  user's persisted dev state.
- Use targeted tests and source inspection for verification.
- Before extracting strings, apply the SPEC-097 string boundary. Do not spend
  localization work on API-internal fallbacks, query-client internal fallbacks,
  HTTP methods, route constants, CSS classes, enum/status keys, logs, traces,
  debug diagnostics, or test/smoke strings unless they are separately rendered
  as owner-facing product chrome.

## Implementation Phases

### Phase 1: Platform Preference Contract

- [ ] **1.1** Add shared language types, normalizers, and defaults.
      Suggested home: `src/shared/languagePreferences.ts` or
      `src/shared/i18n/languages.ts`.
- [ ] **1.2** Extend `PlatformPreferences` with:
      `assistantResponseLanguage` and `uiLanguage`.
- [ ] **1.3** Preserve backward compatibility only at the persistence boundary:
      old preference files missing these fields normalize to the new defaults.
      Do not add deprecated aliases.
- [ ] **1.4** Extend `parsePlatformPreferencesUpdate()` to validate the two
      new fields and return structured `400` errors for invalid values.
- [ ] **1.5** Extend `/api/platform/preferences` tests or create targeted route
      tests for valid updates, invalid updates, and default normalization.
- [ ] **1.6** Extend `PlatformHostEnvelope` / app-shell payload with:

      ```ts
      language: {
        assistantResponseLanguage: 'unspecified' | 'en' | 'zh-TW';
        uiLanguage: 'auto' | 'en' | 'zh-TW';
        resolvedUiLanguage: 'en' | 'zh-TW';
        supportedUiLanguages: ['en', 'zh-TW'];
      }
      ```

- [ ] **1.7** Add a locale resolver. For `auto`, use renderer/Electron locale
      candidates when available; resolve any `zh` locale to `zh-TW`, any `en`
      locale to `en`, otherwise `en`.
- [ ] **1.8** Update renderer app-shell normalization so older payloads default
      safely during tests.

**Deliverables**: platform preference storage, API validation, and app-shell
language state exist before any visible UI uses them.

### Phase 2: Settings General Language Section

- [ ] **2.1** Add a **Language** section to General Settings after Profile and
      before Lobby motion.
- [ ] **2.2** Render assistant response language options with
      `SettingsOptionRow asChoice`:
      `Unspecified`, `English`, `繁體中文`.
- [ ] **2.3** Render Cats UI display language options with
      `SettingsOptionRow asChoice`:
      `Auto-detect`, `English`, `繁體中文`.
- [ ] **2.4** Use `/api/platform/preferences` for updates. Keep the two save
      paths independent.
- [ ] **2.5** Optimistically update the local payload, then refresh the app
      shell/envelope after successful saves.
- [ ] **2.6** On failure, revert the local payload and show a toast. Do not add
      inline feedback text.
- [ ] **2.7** Add a focused Settings General test for rendering both option
      groups, saving each field, and enforcing independent updates.

**Deliverables**: the owner can change both requested settings from one visible
place, even before every UI string has been extracted.

### Phase 3: I18n Core and Renderer Provider

- [ ] **3.1** Create the typed catalog layer.
      Suggested files:
      - `src/shared/i18n/languages.ts`
      - `src/shared/i18n/messageKeys.ts`
      - `src/shared/i18n/catalogs/en.ts`
      - `src/shared/i18n/catalogs/zh-TW.ts`
      - `src/shared/i18n/format.ts`
      - `src/shared/i18n/index.ts`
- [ ] **3.2** Create renderer provider/hook files:
      - `src/app/renderer/i18n/I18nProvider.tsx`
      - `src/app/renderer/i18n/useI18n.ts`
- [ ] **3.3** Provide a `t(key, params?)` helper with typed keys and simple
      interpolation.
- [ ] **3.4** Add a test that asserts `en` and `zh-TW` catalogs have exactly
      the same keys.
- [ ] **3.5** Add tests for fallback behavior when an unknown key or unknown
      locale reaches the translator.
- [ ] **3.6** Wrap the top-level renderer with `I18nProvider` using
      `payload.language.resolvedUiLanguage`.
- [ ] **3.7** Update `<html lang>` and `document.title` when the resolved UI
      language changes.

**Deliverables**: UI code can call `t()` and switch locales at runtime without
remote catalog fetches or a full reload.

### Phase 4: First Extraction Pass - App Shell, Settings, Setup, Guide Cat

- [ ] **4.1** Extract strings from platform app shell and route chrome:
      `src/app/renderer/App.tsx`, route labels, product surface entries, and
      top-level navigation.
- [ ] **4.2** Extract General Settings strings, including the new Language
      section.
- [ ] **4.3** Extract the remaining platform Settings pages:
      Desktop Startup, Chat, Code, Work, Runtime, Data, Assistants, My Cats.
- [ ] **4.4** Extract setup wizard strings and setup field labels.
- [ ] **4.5** Extract Lobby strings and Guide Cat placement/sidecar/dock strings.
- [ ] **4.6** Extract shared design component strings only when the component
      owns the user-visible copy. Keep caller-provided strings as props.
- [ ] **4.7** Run targeted UI tests for Settings and setup after extraction.
- [ ] **4.8** Manually inspect General Settings in English and Traditional
      Chinese at desktop and narrow widths to catch overflow.

**Deliverables**: platform-owned chrome outside product transcript surfaces is
localized.

### Phase 5: Product Renderer Extraction - Chat, Code, Work

- [ ] **5.1** Extract shared product shell strings:
      conversation sidebar, recents, pinned entries, MY CATS labels, sidebar
      menu actions, and empty states.
- [ ] **5.2** Extract Chat renderer chrome:
      composer controls, new/direct/group/parallel draft labels, message action
      labels, tooltips, and Cats-owned status text.
- [ ] **5.3** Extract Code renderer chrome:
      new-code drafts, artifact/workspace chrome, product-specific side panels,
      tooltips, and empty states.
- [ ] **5.4** Extract Work renderer chrome:
      work draft controls, project/work/task/run/mission chrome, supervision
      surfaces, tooltips, and empty states.
- [ ] **5.5** Do not translate transcript bodies, assistant output, user input,
      code blocks, file names, provider names, model names, or runtime traces.
- [ ] **5.6** Do not extract API/query helper fallback strings while doing
      product renderer passes. Those strings are implementation fallbacks unless
      the UI intentionally presents them as product copy.
- [ ] **5.7** Add/adjust product renderer tests where current assertions depend
      on English labels.
- [ ] **5.8** Manually inspect Chat, Code, and Work in both locales for button,
      tab, sidebar, and composer overflow.

**Deliverables**: the main product surfaces no longer depend on hard-coded
English chrome for normal operation.

### Phase 6: Owner-Facing Server Message Cleanup

- [ ] **6.1** Audit only server responses that are deliberately shown directly
      as owner-facing UI chrome.
- [ ] **6.2** For known deterministic owner-facing messages, return stable
      codes/keys or map existing codes to renderer catalog messages.
- [ ] **6.3** Keep unknown server errors, low-level transport exceptions,
      API-internal fallbacks, query-client internal fallbacks, debug
      diagnostics, logs, and traces as raw strings or allowlisted categories.
- [ ] **6.4** Add tests for at least one known server error/status mapping.

**Deliverables**: common server-originated UI messages are localizable without
pretending every raw exception, diagnostic, or API fallback should be translated.

### Phase 7: Assistant Response Language Propagation

- [ ] **7.1** Add a shared helper that converts
      `assistantResponseLanguage` into a nullable instruction string.
- [ ] **7.2** Thread the platform language state into dispatch/request builders
      used by Chat, Code, and Work.
- [ ] **7.3** Thread the same policy into Guide Cat assist generation and
      sidecar/help prompt construction.
- [ ] **7.4** Ensure `unspecified` emits no language instruction.
- [ ] **7.5** Ensure `en` and `zh-TW` instructions are appended once per
      request, not once per participant or per retry attempt unless the prompt
      is rebuilt from scratch.
- [ ] **7.6** Add targeted tests that inspect constructed runtime/provider
      request prompts for each language value.
- [ ] **7.7** Verify explicit user language instructions remain higher priority
      by keeping the platform language instruction phrased as a default.

**Deliverables**: new assistant replies across Chat, Code, Work, and Guide Cat
share the same default response-language policy.

### Phase 8: Final Raw-String Audit

- [x] **8.1** Run a broad raw-string scan over renderer TypeScript/TSX files.
      If `rg` is unavailable, use `grep -RIn`.
- [x] **8.2** Classify every remaining literal string as:
      - localized now
      - dynamic/user/provider/runtime content
      - protocol/config/code identifier
      - API/query internal fallback
      - debug-only diagnostic
      - unknown fallback
- [x] **8.3** Create or update a raw-string allowlist document or source module.
      Suggested doc: `docs/plans/PLAN-086-ui-localization-raw-string-audit.md`
      if the list is too large for the plan progress log.
- [x] **8.4** Report progress using only user-visible chrome as the denominator.
      Do not count debug/internal/API fallback literals as incomplete
      localization work.
- [x] **8.5** Add a lightweight test or script if practical to prevent obvious
      new unlocalized Settings/product chrome strings.
- [x] **8.6** Update this plan's progress log with remaining known gaps.

**Deliverables**: the migration has an explicit evidence trail and future agents
can tell intentional raw strings from missed extraction work.

### Phase 9: Validation and Handoff

- [ ] **9.1** Run targeted unit tests:
      - platform preference normalizers
      - platform preference route parsing
      - app-shell language payload normalization
      - locale resolver
      - catalog key parity
      - assistant language policy helper
- [ ] **9.2** Run targeted renderer tests for Settings General and major
      localized surfaces touched in phases 4 and 5.
- [ ] **9.3** Run the narrowest build/typecheck command that covers changed
      files.
- [ ] **9.4** Manually inspect:
      - General Settings in English
      - General Settings in Traditional Chinese
      - Chat sidebar/composer in both locales
      - Code and Work primary draft surfaces in both locales
      - Guide Cat surface in both locales
- [ ] **9.5** Confirm no demo records were written to user dev state.
- [ ] **9.6** Update docs indexes and progress log with completion status.

**Deliverables**: a clean handoff with tests, manual verification notes, and a
known-gaps list.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/shared/languagePreferences.ts` or `src/shared/i18n/languages.ts` | Create | Shared language enums, defaults, normalizers, locale resolver |
| `src/shared/platformPreferences.ts` | Modify | Persist new platform language preferences |
| `src/shared/platform-contract.ts` | Modify | Expose app-shell language state |
| `src/app/server/platformSetupRouteSupport.ts` | Modify | Parse and validate platform language preference updates |
| `src/app/server/platformSetupPreferenceRoutes.ts` | Modify | Return normalized preferences after language updates |
| `src/products/chat/api/routeSupport.ts` | Modify | Include language state in app-shell creation |
| `src/products/shared/renderer/api/normalization.ts` | Modify | Normalize language payload defaults |
| `src/app/renderer/settings/PlatformSettingsGeneral.tsx` | Modify | Add Language settings section |
| `src/shared/i18n/**` | Create | Catalogs, keys, format helpers |
| `src/app/renderer/i18n/**` | Create | React provider and hook |
| `src/app/renderer/**` | Modify | Extract platform shell, setup, Settings, Lobby, Guide Cat strings |
| `src/products/shared/renderer/**` | Modify | Extract shared product shell strings |
| `src/products/chat/renderer/**` | Modify | Extract Chat chrome strings |
| `src/products/code/renderer/**` | Modify | Extract Code chrome strings |
| `src/products/work/renderer/**` | Modify | Extract Work chrome strings |
| `src/platform/orchestration/**` | Modify | Consume assistant response language policy in runtime dispatch paths |
| `src/platform/memory/**` / Guide Cat assist files | Modify as needed | Apply same policy to Guide Cat assist prompt construction |
| `tests/**` | Create/Modify | Targeted tests for preferences, i18n catalogs, Settings, and prompt policy |
| `docs/decisions/093-*.md` | Maintain | ADR for language preference ownership |
| `docs/specs/SPEC-097-*.md` | Maintain | Specification for language settings and localization |
| `docs/plans/PLAN-086-*.md` | Maintain | Implementation checklist and progress log |

## Technical Decisions

- **Preference boundary**: use `/api/platform/preferences`, not Chat-local
  `/api/preferences`.
- **Settings home**: General Settings, because both preferences are
  platform-wide.
- **Catalog strategy**: typed internal catalogs first; no third-party i18n
  dependency in this rollout.
- **Locale values**: persist BCP-47-style `zh-TW` for Traditional Chinese and
  `en` for English; persist `auto` only for UI language.
- **Assistant policy**: phrase language instructions as defaults so explicit
  user instructions can override them.
- **String extraction**: localize Cats-owned chrome aggressively, but maintain an
  allowlist for protocol/runtime/user/provider strings that should remain raw.
- **Extraction boundary**: do not localize or count API-internal fallback
  messages, query-client internal fallbacks, HTTP methods, route constants, CSS
  classes, enum/status keys, logs, traces, debug diagnostics, or test/smoke
  strings unless they are intentionally rendered as owner-facing product chrome.

## Testing Strategy

- **Unit Tests**
  - preference normalizers and defaults
  - `/api/platform/preferences` parser
  - app-shell language payload normalization
  - locale resolver
  - catalog key parity
  - `t()` interpolation behavior
  - assistant response language instruction helper
- **Integration Tests**
  - Settings General updates assistant response language and UI language
  - app-shell refresh reflects persisted language settings
  - runtime dispatch prompt assembly includes the correct default language
    instruction
- **Manual Testing**
  - switch UI language among Auto-detect / English / Traditional Chinese
  - inspect Settings, Lobby, Chat, Code, Work, and Guide Cat surfaces
  - verify successful setting changes do not show inline feedback
  - verify failed setting saves use toast
  - verify no transcript content is translated

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Incomplete string extraction leaves mixed-language chrome | High | Use Phase 8 audit and explicit allowlist before handoff |
| Product surfaces build their own assistant language prompts | High | Centralize policy helper and add prompt-construction tests |
| UI locale and assistant response language become coupled | Medium | Keep separate preference fields, separate Settings option groups, and independent tests |
| Traditional Chinese strings overflow existing controls | Medium | Manual viewport inspection and targeted layout fixes after extraction |
| Server raw errors cannot be localized safely | Medium | Convert only known owner-facing messages to keys; keep unknown/internal/debug/API fallbacks as documented raw strings |
| New i18n layer leaks app/product imports into design primitives | Medium | Keep shared i18n helpers product-agnostic and enforce import direction in review |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-29 | Plan created with ADR-093 / SPEC-097 for platform language settings and UI localization rollout |
| 2026-05-01 | Clarified extraction boundary: localization work targets owner-facing Cats UI chrome only; API/query fallbacks, debug diagnostics, logs, route/method/class/enum identifiers, and smoke/test strings must not be extracted or counted as progress debt. |
| 2026-05-04 | Completed the final raw-string audit slice for Desktop bootstrap/onboarding, Runtime Settings helper presentation, shared runtime chips, and product renderer chrome. Remaining hits are documented in `PLAN-086-ui-localization-raw-string-audit.md`; subsequent slices resolved the known Chat relay transcript/prompt locale-policy gap. |
| 2026-05-04 | Added `tests/ui-localization-raw-string-audit.test.tsx` as a lightweight guard against obvious new raw English `label`, `title`, `placeholder`, tooltip, and `aria-label` literals in renderer/product UI chrome. |
| 2026-05-04 | Localized mobile product sidebar fixed chrome: Chat/Code/Work primary actions, MY-lens and Recents section labels, empty states, and cat status labels now flow through mobile English / Traditional Chinese copy. |
| 2026-05-04 | Extracted deterministic Guide Cat assist baseline greetings and starter prompts into shared i18n catalogs, and localized deterministic Lobby/Chat/Code assist greetings at render time while preserving runtime-authored assist copy. |
| 2026-05-04 | Localized deterministic operator activity feed labels such as Checkpoint, Outcome, Replay, Recovery, Action, Artifact, and Update at presentation time while preserving runtime/external activity labels as content. |
| 2026-05-04 | Localized Telegram command descriptions and deterministic slash-command replies, including zh command catalog registration via Telegram `language_code=zh` while preserving English fallback commands. |
| 2026-05-04 | Removed unused English labels/descriptions from runtime skill profile source records; Settings Cats remains the owner of localized skill profile presentation. |
| 2026-05-04 | Localized Chat parallel relay command definitions, persisted outgoing/incoming transcript notes, and deterministic relay prompt templates via shared English / Traditional Chinese catalogs; relay requests carry the initiating renderer locale and preserve English fallback behavior. |
| 2026-05-04 | Localized deterministic live runtime error progress/status text such as runtime stream unavailable and proxy errors at renderer presentation time while keeping SSE payloads protocol-stable. |
| 2026-05-04 | Converted Cats Code relay roster availability summaries from persisted English sentences to structured runtime probe kinds/values rendered through shared English / Traditional Chinese catalogs. |
| 2026-05-04 | Localized known Cats-owned Work run summaries in list/detail presentation, including supervised Work, Code task, scheduled mission, provider-agent, and Code relay fan-out summaries; runtime-authored summaries remain content. |
| 2026-05-04 | Extended shared operator action i18n coverage to the recovery-specific retry tooltip for replaying stored dispatch/workflow continuations. |
| 2026-05-04 | War Room latest timeline titles now localize known Cats-owned Core timeline templates, supervision evidence prefixes, provider-agent plan prefixes, and checkpoint/trace prefixes while preserving user/runtime-authored titles. |
| 2026-05-04 | Work execution presentation now localizes known strategy, delivery-mode, next-action, and delivery-action tokens in War Room while preserving unknown runtime tokens through the existing Title Case fallback. |
| 2026-05-04 | War Room recovery/control-plane metadata now localizes known approval status, replay state/source, attention reason, and workflow blocked-reason tokens while preserving activity messages and replay errors as content. |
| 2026-05-04 | Code Builder execution control labels now localize known workflow blocked reasons beyond approval pending while preserving unknown runtime guard tokens verbatim. |
| 2026-05-04 | Shared screenshot capture feedback now localizes known desktop-host permission and wlroots/no-display error messages at the renderer boundary while preserving unknown host errors as content. |
| 2026-05-04 | Chat companion settings now reuse the shared Telegram inbound-mode i18n labels so binding metadata no longer renders raw `polling` / `webhook` tokens. |
| 2026-05-04 | Work Top-down object drawers now localize evidence relation metadata (`artifact`, `activity`, `outcome`) instead of rendering raw relation tokens. |
| 2026-05-04 | Work Top-down object drawers now localize structural layer metadata (`interaction`, `planning`, `execution`) instead of rendering raw graph layer tokens. |
| 2026-05-04 | Work task product binding pills now localize `work`, `code`, `chat`, and `unbound` metadata across Tasks list/detail and Top-down cards. |
| 2026-05-04 | Work Top-down diagnostic headers now localize severity and diagnostic-kind metadata across Broken Links and object drawers. |
| 2026-05-04 | Work run detail now localizes trace kind, outcome status, and artifact status metadata instead of rendering raw execution/result tokens. |
| 2026-05-04 | Settings Cats registry now localizes cat status and built-in product badge metadata instead of rendering raw status/product tokens. |
| 2026-05-04 | Shared operator Run Inspector now localizes workflow branch status metadata and passes the active UI locale into run-tab status labels. |
| 2026-05-04 | Runtime Settings lifecycle feedback now localizes desktop setup helper summary templates beyond the WSL/Docker manual-detail cases. |
| 2026-05-04 | Cats Code sidebar pinned codespace status tooltips now reuse localized workspace status labels instead of raw status tokens. |

---

*Created: 2026-04-29*
*Author: Codex*
