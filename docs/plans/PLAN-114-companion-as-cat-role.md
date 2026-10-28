# PLAN-114: Companion as a Cat Role

## Metadata

| Field | Value |
| --- | --- |
| Status | Implemented; focused and full local tests recorded below; Settings visual acceptance pending |
| Owner | Platform integration |
| Reviewer | Product owner |
| Decision | [ADR-124](../decisions/124-model-companion-as-a-cat-role-not-a-skill-profile.md) |
| Related | [ADR-040](../decisions/040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md) §6, [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md), [SPEC-019](../specs/SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md), [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md), [PLAN-113](PLAN-113-managed-plugin-capabilities.md) |
| Version boundary | cats-platform `0.6.0` (removes an accepted value of the public API and rewrites existing data); this plan only records it and does not bump |

## Overview

companion used to be a value of `skillProfile` (`'companion'`). `hasCompanionSkill` and
`shouldHydrateCompanionSession` also accept `roles.includes('companion')`, but users cannot
reach that path: `roles` can only be supplied when creating through `POST /api/cats`, the PATCH
body has no such field, and the UI cannot edit it.

PLAN-113 (#163, 2026-09-29) put Agency plugin skills into the same `skillProfile` field, so
companion and Agency skills became mutually exclusive, producing three symptoms:

- Settings' `PluginSkillOptions` and the companion pill write the same field. After an Agency
  skill is selected, the Cat is no longer a companion: the profile-page feed is hidden, and the
  runtime no longer requests the companion skill.
- Telegram `/mode agent` writes `'chat-default'`, which overwrites the Agency skill; `/mode` also
  only looks at `skillProfile`, so a companion marked by role is displayed as agent.
- The determination is inconsistent: hydration looks at role or skillProfile, but the runtime
  companion skill looks only at `skillProfile`.

The direction of ADR-040 §6 is "the same Cat identity, with behavior layered on by mode", not a
crude global mode switch. This plan moves companion identity to the Cat-level `roles`, making it
independent from `skillProfile`.

Cats Work does not read `skillProfile`; whether a Cat participates in Work is decided by
`products[]`, which is unaffected. After the change, a companion Cat can carry an Agency skill in
Chat without losing its companion identity.

## Goals

- Companion identity equals the Cat-level `'companion'` role, unrelated to `skillProfile`.
- A companion Cat carrying an Agency skill keeps the profile-page feed, companion box, Telegram
  `/mode` state and registry label.
- `'companion'` is no longer a valid `skillProfile` value; no alias is kept, per the pre-release policy.
- Existing data gets a one-time migration that meets the AGENTS.md requirements for validation,
  backup, atomic replacement and failure retention.
- Minimal change to the Settings screen (owner's requirement).

## Non-Goals

- No work to move companion from Chat to a platform entity (the SPEC-102 wrap-up); that is a separate plan.
- Do not touch `src/products/chat/renderer/components/companion/` and the related hooks. That is
  the legacy DM toolbar toggle page the owner deliberately kept (see the commit message of `abbe6a15`).
- Do not lift the cats-runtime managed plugin restriction of "managed skills only" (see Decision 1);
  it is listed as follow-up work for cats-runtime.
- Do not change the room modes the companion skill applies to: keep the existing behavior, where
  it is requested in every Chat channel the Cat participates in.
- Do not change the `skillProfile` of channels and the orchestrator (`'chat-default'`, `'aaif-a2a-default'`).

## Technical Decisions

### 1. Judge identity and behavior separately

- The `'companion'` role decides the identity surfaces: the profile-page feed (`hideFeed` in
  `CatProfilePage.tsx`), the companion box hydration condition, Telegram `/mode`, and the registry label.
- The runtime `companion` skill is requested when "there is a companion role, and `skillProfile`
  is a built-in value (`null` or `'chat-default'`)", derived from the `companion` input of
  `resolveSkillProfileManifest`.
- When companion is derived from the role and no built-in profile contributes a skill, the manifest
  carries no `profileId`. The runtime's `RuntimeSkillManifest.profileId` is optional, and cats-runtime
  `src/core/hydration/sessionHydration.test.ts:80` already covers `['companion']` without a `profileId`.
- When the selected skill contains `plugin:*`, the companion skill is not requested. The reason is
  that cats-runtime `src/core/skills/managedPlugins.ts:193` returns a conflict ("with managed skills
  only") whenever it sees a non-Agency skill; forcing it on top would leave the Cat completely unable to reply in Chat.
- The memory context of the companion box is unaffected: it is sent via
  `manifest.context.metadata.companionSession` (`enrichSkillManifestWithCompanionSession` in
  `runtimeTargeting.ts`), and the managed plugin path only checks `requestedSkills`.
- Trade-off: a Cat with Agency plus companion gets the Agency role instructions and the companion
  memory in Chat, but not the companion tone skill. Remove this exclusion once cats-runtime allows mixing.

### 2. A single determination helper

- `src/shared/companionRole.ts`: `COMPANION_ROLE`, `COMPANION_SKILL_ID`, `isCompanionCat`,
  `withCompanionRole`. It lives in `src/shared`, depends only on structural types, and does not violate
  the direction rules of `tests/dependency-graph.test.js`.
- `hasCompanionSkill` keeps its name and location, and its body now calls `isCompanionCat`. This way
  `CatProfilePage.tsx` and the retained chat files need no import change; renaming is left to the companion relocation plan.

### 3. API shape

- Create Cat: reuse the existing `roles?: string[]` of the frozen contract `CatDraftInput`; the frozen file is not changed.
- Update Cat: add `companion?: boolean` to the inline body of `PATCH /api/cats/{catId}`
  (`canonicalCatRoutes.ts`, not on the frozen list); a non-boolean returns `400 bad_request`. The
  renderer's `updateCatProfile` input type is updated to match.
- PATCH does not open up free editing of `roles`: `cat.roles` is a free string with no UI editing need;
  a dedicated boolean keeps the contract narrow.
- `normalizeCatSkillProfile` (`src/shared/skillProfiles.ts`) rejects `'companion'`;
  `createCatRecord` and `updateCatSkillProfile` both go through it and return `400 bad_request`, to avoid
  producing new data in the old format.

### 4. The channel view projects companion; it is not synced at write time

- The roles of a channel assignment are a snapshot at the time of joining the channel, and the user can
  set channel-specific roles (for example `['reviewer']`). The read model prefers the assignment roles.
- All channel cat views go through `hydrateChannelCat` (`readModels.ts`), and the prompt's assigned cats
  are assembled in `memoryLayers.ts`. Both use `withCompanionRole` to project companion from the Cat's own
  state, so:
  - Toggling companion is reflected immediately in every channel, with no assignment rewritten.
  - A leftover `'companion'` in an old assignment snapshot is removed in the view.
  - `orchestratorPlan.ts` can decide directly from the view roles (the frozen `OrchestratorChannelCat`
    has no Cat-level roles), with no change to the frozen contract.
- This is simpler than the originally planned "sync at four write points" and needs no assignment migration.

### 5. Telegram `/mode`

- `/mode companion` turns the role on and `/mode agent` turns the role off; neither writes `skillProfile`
  any more. The command names and reply text are unchanged.

### 6. One-time data migration

- Implementation: `src/products/chat/state/companionRoleMigration.ts`, called by
  `FileChatStore.tryReadSnapshotFile` after `repairPersistedSetupCompletion`.
- Detection: any Cat in `cats[]` with `skillProfile === 'companion'`.
- Transformation: add `'companion'` to `cat.roles` and set `skillProfile` to `null`. Assignments need no
  migration (Decision 4). The `skillProfile` of channels and the orchestrator is untouched.
- Backup: before replacing, write a dedicated `<state>.pre-companion-role.bak` with `wx`, containing the
  original bytes read. The rolling `.bak` is overwritten on every write, which does not meet the policy.
  An existing dedicated backup is not overwritten.
- Validation: run `normalizePersistedChatSnapshot` again on the transformed snapshot, and confirm that every
  migrated Cat carries the role, no longer carries the `'companion'` skillProfile, and the Cat count is unchanged.
- Replacement: `writePersistedChatSnapshot` (atomic replacement via a temp file plus rename).
- Failure handling:
  - Validation or backup failure: do not migrate, leave the original file untouched, emit
    `reportStoreDiagnostic('companion_role_migration_failed', …)`, and retry on the next read.
  - Backup succeeded but the write failed: serve the migrated state from memory and emit a diagnostic; it
    lands on the next normal write.
- Recovery path: `recoverFromBackup` is passed the `.bak` path. The dedicated backup's file name and write
  target are always derived from `this.filePath`; when reading from the `.bak`, write the `.bak`'s original
  content as the dedicated backup, transform only in memory, and hand it to `recoverFromBackup` to write back to the main file.
- `MemoryChatStore` applies the same transformation at construction, without a backup.
- The core actor re-projects from `chat.cats` every time it builds a snapshot, so it needs no separate migration.
- Removal timing: the migration code can be deleted in the minor after `0.6.0`.

### 7. ADR

- After owner agreement on 2026-09-29, it was written as
  [ADR-124](../decisions/124-model-companion-as-a-cat-role-not-a-skill-profile.md),
  and ADR-040 also gained an amendment pointing to it.

### 8. UI is in scope this time, with minimal change

- The owner decided to include the UI in this scope and asked for minimal screen changes, to be adjusted
  later if unsatisfied.
- Approach: the Companion pill in the "Skill profile" row of the Settings Cat panel stays in place, with the
  same appearance and text (zh-TW 「助手」, "Assistant"), but becomes an independent toggle (`aria-pressed`)
  that calls the `companion` API and no longer writes `skillProfile`.
- There is exactly one visible difference: it is no longer mutually exclusive with 「預設」 ("Default") and the
  Agency pills, so a companion with the default skill lights up both 「預設」 and 「助手」.
- The same pill in the create form now toggles `catForm.companion`, and creation sends `roles: ['companion']`.
- The registry's `catMeta` is produced by `describeCatSkillProfile`: a companion is still shown as 「助手」,
  and when a non-default skill is also selected it shows 「助手 · <skill>」.
- `CatInspectPanel` is currently not rendered anywhere and is unchanged.
- No new i18n key and no new UI component were added.

## Implementation

- [x] `src/shared/companionRole.ts`; the `companion` derivation in `skillProfiles.ts`, plugin exclusion,
      `normalizeCatSkillProfile`.
- [x] Three manifest call sites: `runtimeTargeting.ts`, `orchestratorPlan.ts`,
      `companionBoxRoutes.ts`.
- [x] `hasCompanionSkill` and `hydration.ts` switched to `isCompanionCat`.
- [x] Delete `src/products/chat/state/skillResolution.ts` (it had no callers).
- [x] `setCatCompanion`; `createCatRecord` and `updateCatSkillProfile` reject `'companion'`.
- [x] The companion projection in `hydrateChannelCat` and `memoryLayers.ts`.
- [x] `companion` on `PATCH /api/cats/{catId}`; Telegram `/mode` switched to toggling the role.
- [x] One-time data migration and the dedicated backup.
- [x] UI: the two panel sets `cats/` and `settings-cats/` (edit panel, create form, detail panel,
      registry), and `onCompanionChange` in `settingsCatsRegistryActions`.
- [x] Docs: `docs/api.md`, SPEC-019, SPEC-121, the ADR-040 amendment, ADR-124.
- [ ] Send the owner a source-candidate screenshot to confirm the Settings panel.
- [x] `docs/release-notes.md` records the `0.6.0` boundary at release time (per the release guide, not bumped on this branch).
      Recorded on 2026-09-29 by the 0.6.0 version preparation; the release and verification results will be added separately.

## Testing

- Added `tests/companion-role.test.js`:
  - manifest derivation: companion only, default plus companion, plugin plus companion, neither.
  - `normalizeCatSkillProfile`, `createCat`, `updateCatSkillProfile` reject `'companion'`.
  - `withCompanionRole` preserves order.
  - channel view projection: with an assignment of `['reviewer']`, toggling companion is reflected immediately.
  - `FileChatStore` migration: the dedicated backup content equals the original bytes, the main file is rewritten, and a second read changes nothing.
  - migration and backup on the `.bak` recovery path.
  - `MemoryChatStore` migration.
- `tests/rest-api.test.js`: PATCH `companion` toggle, coexistence with a plugin skill, `skillProfile:
  'companion'` and non-boolean values return 400.
- `tests/provider-telegram-routes.test.js`: `/mode` only toggles the role, and `skillProfile` stays `null`.
- `tests/settings-cats-view-support.test.tsx`: `SKILL_PROFILES`, `COMPANION_PILL_LABEL`,
  `describeCatSkillProfile`.
- 59 `skillProfile: 'companion'` fixtures across 12 test files were changed to `'companion'` in `roles`.
- Tests run only in temporary directories and do not write to the user's dev state (State Hygiene Policy).

### 2026-09-29 local validation (Windows, Git Bash)

- `tsc --noEmit`: `tsconfig.server.json`, `tsconfig.json`, `tsconfig.desktop.json`,
  `tsconfig.test.json` pass; `tsconfig.test.json` is left with only two module-not-found errors in
  `mobile/src/api/persistence.ts`, caused by the worktree not having mobile dependencies installed and unrelated to this change. `mobile:typecheck` was not run.
- Full node test set (`tests/**/*.test.js`, `build/test/*.test.js`): 5325, with 5304 passed,
  10 skipped, 11 failed.
  - The expected value of `emptyCatForm` lacked the new `companion` field; fixed and re-run to pass.
  - The other 10 are environmental and unrelated to this change: GNU `tar` in `orchestrator-distribution.test.js`
    treats `C:` as a remote host; 9 tests in `unix-installer-observations.test.js` need bash with
    `/mnt/c` paths.
- After fixing the fixture, all affected files re-ran and passed; the full result is as per the PR CI (`validate`, `nodejs (24)`).

## Risks & Mitigations

- A Cat with Agency plus companion has no companion tone skill (medium): recorded explicitly in Decision 1;
  remove the exclusion after cats-runtime later relaxes the managed plugin restriction.
- The migration acts on the user's real state file (high): write the dedicated backup first, replace atomically
  only after validation; on failure keep the original file and emit a diagnostic.
- Two nearly identical Cats panels (`cats/` and `settings-cats/`): change both in sync,
  and the view-support tests cover the shared helper.
- 「預設」 ("Default") and 「助手」 ("Assistant") lighting up together may make people think it is single-select (low): the owner knows and accepts this, to be adjusted later.

## Progress Log

- 2026-09-29: plan created (Draft), awaiting owner review of UI item 1 and Decision 7.
- 2026-09-29: the owner agreed to write an ADR, and ADR-124 was added.
- 2026-09-29: the owner decided to include the UI in this scope with minimal change; implementation was completed on
  `feat/companion-cat-role`. Assignment sync was changed to projection at read time (Decision 4).

---

*Created: 2026-09-29*
*Author: Claude*
