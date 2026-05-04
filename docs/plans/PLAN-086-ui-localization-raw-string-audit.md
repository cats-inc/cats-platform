# PLAN-086 UI Localization Raw-String Audit

> Raw-string audit and allowlist for SPEC-097 / PLAN-086. This document
> separates remaining intentional literals from Cats-owned UI chrome that must
> be extracted into `src/shared/i18n`.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Active allowlist |
| **Last audited** | 2026-05-04 |
| **Scope** | Cats desktop renderer, desktop host bootstrap/onboarding, Chat, Code, Work, shared design components |

## Current Result

Focused scans over renderer, desktop bootstrap, setup, Settings, Chat, Code,
Work, and shared design files did not find remaining normal-path Cats-owned UI
chrome that should be translated immediately.

The final 2026-05-04 cleanup localized:

- packaged setup helper and support labels shown in desktop bootstrap/setup and
  Runtime Settings
- desktop readiness and bootstrap summaries that are intentionally surfaced to
  the owner
- shared runtime connection chip labels
- mobile product sidebar primary actions, section labels, empty states, and cat
  status labels
- deterministic Guide Cat assist baseline greetings and starter prompts, with
  runtime-authored assist copy preserved as content
- deterministic operator activity feed labels such as Checkpoint, Outcome,
  Replay, Recovery, Action, Artifact, and Update at presentation time, with
  external/runtime activity labels preserved as content
- Telegram command descriptions and deterministic slash-command replies,
  including a Traditional Chinese command catalog registered with Telegram
  `language_code=zh` and per-message reply localization from sender language
  codes

Remaining raw-string hits belong to the allowlisted categories below unless a
future UI change renders them as normal owner-facing chrome.

`tests/ui-localization-raw-string-audit.test.tsx` guards the highest-signal
renderer/product directories against obvious new raw English UI chrome in
`label`, `title`, `description`, `placeholder`, tooltip, and `aria-label`
literals. If that test fails, either move the string into the shared i18n
catalogs or update this allowlist with a SPEC-097 reason.

## Allowlist

| Category | Examples | Decision |
|----------|----------|----------|
| Dynamic owner, provider, runtime, and file data | Cat names, owner names, provider labels such as `Claude Code`, model IDs, branch names, paths, URLs, commands, terminal output | Keep raw. These are content or identifiers, not UI copy. |
| Protocol, config, and code identifiers | route paths, HTTP methods, enum/status keys, query keys, CSS classes, test IDs, telemetry names | Keep raw. Translating these would break contracts or diagnostics. |
| API/query internal fallbacks | `src/app/server/**`, `src/products/*/api/**`, `sendRestError(...)`, query-client fallback errors | Keep raw by default. Map only deterministic owner-facing codes in the renderer or bootstrap page when intentionally shown as product chrome. |
| Desktop host source payloads localized at presentation | English readiness/action/setup strings in `desktop/host/readiness.ts`, `desktop/host/packaging.ts`, `desktop/host/setupAssets.ts` | Allowed at source because `desktop/host/bootstrapPage.ts`, `desktop/host/trayMenu.ts`, and Runtime Settings helpers localize the owner-facing presentation. |
| Debug-only/developer diagnostics | `src/design/components/settings/SettingsDangerZone.tsx` child-type warning, console diagnostics, thrown assertion messages | Keep raw. These are developer diagnostics, not user-facing product chrome. |
| Chat relay prompts and persisted system-note templates | `src/products/chat/shared/parallelChats.ts` relay prompt bodies and outgoing/incoming note templates | Keep raw for now. The renderer relay menu labels are localized; prompt text and persisted transcript notes need a separate locale-aware server/transcript template policy before translation. |
| API projection compatibility strings | Code/Work dashboard `title` and `emptyState` fields returned by API projections but not used by current renderer chrome | Keep raw until a product client intentionally renders those API fields. Current renderers provide localized section chrome themselves. |
| External or third-party copy | provider diagnostics, runtime summaries, update manifests, external service messages | Keep raw unless Cats wraps the value in a deterministic UI message. |

## Re-Audit Triggers

Revisit this allowlist when:

- a raw API projection string becomes visible in normal renderer UI
- server routes start accepting an explicit locale for product clients
- persisted Cats-owned transcript/system-note templates gain a locale policy
- a new Settings, setup, Chat, Code, Work, or Guide Cat component adds direct
  `title`, `label`, `placeholder`, tooltip, toast, or `aria-label` literals

When a string moves out of the allowlist, add a stable message key, English and
Traditional Chinese catalog entries, and a focused test covering the rendered
surface or presentation helper.
