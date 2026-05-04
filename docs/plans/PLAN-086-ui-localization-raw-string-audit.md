# PLAN-086 UI Localization Raw-String Audit

> Raw-string audit and allowlist for SPEC-097 / PLAN-086. This document
> separates remaining intentional literals from Cats-owned UI chrome that must
> be extracted into `src/shared/i18n`.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Active allowlist |
| **Last audited** | 2026-05-04 |
| **Scope** | Cats desktop renderer, mobile renderer/app shell, desktop host bootstrap/onboarding, Chat, Code, Work, shared design components |

## Current Result

Focused scans over desktop renderer, mobile renderer/app shell, desktop
bootstrap, setup, Settings, Chat, Code, Work, and shared design files did not
find remaining normal-path Cats-owned UI chrome that should be translated
immediately.

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
- runtime skill profile source records no longer carry unused English labels or
  descriptions; Settings Cats owns the localized skill profile presentation
- the desktop bootstrap runtime-unavailable recovery summary that is emitted by
  readiness snapshots and shown in bootstrap diagnostics/recovery presentation
- live finalization progress now uses the semantic `progressKind=finalizing`
  signal before falling back to legacy English progress text matching
- deterministic live runtime error progress/status text is localized at
  renderer presentation time while SSE payloads remain protocol-stable
- Chat parallel relay command copy, persisted transcript notes, and relay prompt
  templates now resolve through the shared English / Traditional Chinese i18n
  catalogs, with English retained as the fallback when no locale is supplied
- Cats Code relay roster availability summaries now persist structured probe
  kinds/values and render deterministic runtime probe copy through the shared
  i18n catalogs
- Cats Code sidebar pinned codespace status tooltips now use localized
  workspace status labels instead of raw status tokens
- Work run list/detail pages localize known Cats-owned deterministic run
  summaries at presentation time while preserving runtime-authored summaries as
  content
- operator retry action tooltips now cover the recovery-specific stored
  dispatch/workflow continuation description through the shared action i18n map
- War Room latest timeline titles localize known Cats-owned Core timeline
  templates and prefix-based supervision evidence/provider-agent/checkpoint
  titles while preserving unknown user/runtime-authored titles verbatim
- Work War Room execution presentation localizes known strategy, delivery-mode,
  next-action, and delivery-action tokens while preserving unknown runtime tokens
  through the existing Title Case fallback
- War Room recovery/control-plane metadata localizes known approval status,
  replay state/source, attention reason, and workflow blocked-reason tokens
  while preserving activity messages and replay errors as content
- Code Builder execution control labels localize known workflow blocked reasons
  beyond approval pending while preserving unknown runtime guard tokens verbatim
- Shared screenshot capture feedback localizes known desktop-host permission,
  wlroots, and no-display error messages at the renderer boundary while
  preserving unknown host errors as content
- Chat companion settings reuse the shared Telegram inbound-mode i18n labels so
  binding metadata no longer renders raw `polling` / `webhook` tokens
- Work Top-down object drawers localize evidence relation metadata (`artifact`,
  `activity`, `outcome`) instead of rendering raw relation tokens
- Work Top-down object drawers localize structural layer metadata (`interaction`,
  `planning`, `execution`) instead of rendering raw graph layer tokens
- Work task product binding pills localize known binding metadata (`work`,
  `code`, `chat`, `unbound`) across Tasks list/detail and Top-down cards
- Work sidebar pinned project status tooltips use localized Work object status
  labels instead of raw status tokens
- Work actor role chips/headings localize common Cats-owned role tokens such as
  `planner`, `reviewer`, and `main_coder` while preserving unknown
  user-authored roles
- Work Top-down diagnostic headers localize severity and diagnostic-kind
  metadata instead of rendering `error`, `warning`, `orphan_link`, or
  `link_cycle`-style tokens
- Work run detail localizes trace kind, outcome status, and artifact status
  metadata instead of rendering raw execution/result tokens
- Settings Cats registry localizes cat status and built-in product badge
  metadata instead of rendering `active`, `archived`, `chat`, `code`, or `work`
- Shared operator Run Inspector localizes workflow branch status metadata such
  as `pending`, `running`, `blocked`, and `waiting_for_converge`, and run tabs
  now use the active UI locale for run status labels
- Shared operator progress summaries localize effective delivery mode, delivery
  gate, and budget alert metadata such as `commit_only`,
  `owner_approval_required`, and `blocked`
- Shared operator progress summaries and Run Inspector localize workflow shape
  and branch strategy metadata such as `converge` and `transplant_context`
- Shared operator Run Inspector localizes branch handoff reason metadata such
  as `explicit_mention` and `workflow_continuation`
- Shared operator progress summaries and Run Inspector localize workflow stage
  metadata such as `concurrent_fan_out` and `continuation_handoff`
- Shared operator guardrail/cooldown callouts localize known deterministic
  guard labels such as `anti_ping_pong`, `max_dispatches`, and
  `Cooldown active` while preserving custom runtime-authored cooldown text
- Runtime Settings lifecycle feedback localizes desktop setup helper summary
  templates such as retry, restart, manual follow-through, missing requirement,
  and helper-finished status messages
- Desktop bootstrap diagnostics and setup-fix cards localize known packaged
  setup helper error templates such as missing helper assets, unsupported modes,
  unsupported host platforms, and missing structured output
- The raw-string audit guard now also scans literal JSX text nodes and literal
  JSX expression children, while continuing to ignore icon/entity-only text
  such as close buttons and overflow glyphs
- Work run stop and mission cancel blocked feedback localize known run
  cancellation blocker reasons instead of rendering deterministic server
  summary text directly
- Chat companion message reference previews localize parser invalid-reason
  tokens such as `malformed_percent_encoding` while keeping the parser contract
  stable
- Work timeline and execution replay labels now translate owner-facing
  provider-agent/orchestrator terms in Traditional Chinese catalog entries
- Cats Code Relay localizes connector transport metadata such as
  `runtime_session_bridge` instead of showing protocol tokens as labels
- Work create/delete dialogs map known deterministic CRUD validation and
  not-found API messages to localized renderer copy while preserving unknown
  server exceptions
- Platform setup/onboarding maps coded setup API failures such as bad request,
  already-complete, and internal server errors to localized wizard feedback
- Settings Assistants maps deterministic assistant and Guide Cat API validation
  failures to localized toast feedback instead of rendering raw server messages
- Settings Cats registry maps deterministic cat roster and Telegram binding
  mutation errors to localized feedback, including product app archive actions,
  while preserving unknown diagnostics
- Settings Cats memory save/delete feedback localizes deterministic memory API
  validation and not-found errors, and delete now rejects failed responses
- Workspace product app-shell initial load maps internal `cats app shell returned
  {status}` fallback errors to localized renderer failure copy
- Workspace cat assignment actions map deterministic channel, assignment, direct
  lane, participant-limit, and shared cat validation failures to localized
  feedback while preserving unknown diagnostics
- Shared workspace navigation and Chat/Code/Work product navigation overrides map deterministic
  chat/channel/parallel-chat mutation failures and cat archive/delete failures
  to localized feedback while preserving unknown diagnostics
- Product settings preference controls map deterministic conversation behavior
  and advanced draft control API fallback failures to localized feedback while
  preserving unknown diagnostics
- Operator loop, governance, and message stop controls map deterministic core,
  channel messaging, and channel/parallel cancellation failures to localized
  feedback while preserving unknown diagnostics
- Composer send/retry and parallel relay compare controls map deterministic
  channel messaging, retry, and parallel relay failures to localized feedback
  while preserving unknown diagnostics
- Channel participant update controls map deterministic participant validation
  and not-found failures to localized feedback while preserving unknown
  diagnostics
- Settings Cats Telegram diagnostics load feedback maps deterministic transport
  status/diagnostics fallback failures to localized feedback while preserving
  unknown diagnostics

Remaining raw-string hits belong to the allowlisted categories below unless a
future UI change renders them as normal owner-facing chrome.

`tests/ui-localization-raw-string-audit.test.tsx` guards the highest-signal
desktop and mobile renderer/product directories against obvious new raw English
UI chrome in `label`, `title`, `description`, `placeholder`, tooltip,
`aria-label`, and literal JSX text nodes. If that test fails, either move the
string into the shared i18n catalogs or update this allowlist with a SPEC-097
reason.

## Allowlist

| Category | Examples | Decision |
|----------|----------|----------|
| Dynamic owner, provider, runtime, and file data | Cat names, owner names, provider labels such as `Claude Code`, model IDs, branch names, paths, URLs, commands, terminal output | Keep raw. These are content or identifiers, not UI copy. |
| Protocol, config, and code identifiers | route paths, HTTP methods, enum/status keys, query keys, CSS classes, test IDs, telemetry names | Keep raw. Translating these would break contracts or diagnostics. |
| API/query internal fallbacks | `src/app/server/**`, `src/products/*/api/**`, `sendRestError(...)`, query-client fallback errors | Keep raw by default. Map only deterministic owner-facing codes in the renderer or bootstrap page when intentionally shown as product chrome. |
| Desktop host source payloads localized at presentation | English readiness/action/setup strings in `desktop/host/readiness.ts`, `desktop/host/packaging.ts`, `desktop/host/setupAssets.ts` | Allowed at source because `desktop/host/bootstrapPage.ts`, `desktop/host/trayMenu.ts`, and Runtime Settings helpers localize the owner-facing presentation. |
| Debug-only/developer diagnostics | `src/design/components/settings/SettingsDangerZone.tsx` child-type warning, console diagnostics, thrown assertion messages | Keep raw. These are developer diagnostics, not user-facing product chrome. |
| API projection compatibility strings | Code/Work dashboard `title` and `emptyState` fields returned by API projections but not used by current renderer chrome | Keep raw until a product client intentionally renders those API fields. Current renderers provide localized section chrome themselves. |
| External or third-party copy | provider diagnostics, runtime summaries, update manifests, external service messages | Keep raw unless Cats wraps the value in a deterministic UI message. |

## Re-Audit Triggers

Revisit this allowlist when:

- a raw API projection string becomes visible in normal renderer UI
- server routes start accepting an explicit locale for product clients
- new persisted Cats-owned transcript/system-note templates are introduced
- a new Settings, setup, Chat, Code, Work, or Guide Cat component adds direct
  `title`, `label`, `placeholder`, tooltip, toast, `aria-label`, or JSX text
  literals

When a string moves out of the allowlist, add a stable message key, English and
Traditional Chinese catalog entries, and a focused test covering the rendered
surface or presentation helper.
