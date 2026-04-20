# PLAN-065: Settings Composition Layer Rollout

> Phased rollout of the six Settings primitives, Settings-scoped tokens,
> and CSS dedupe defined in SPEC-073 / ADR-072. Structured so each phase
> delivers a safely rollback-able increment and the prop-shape API
> ratifies on a simple page (General) before complex pages (Assistants,
> My Cats) land.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | user |
| **Reviewer** | Codex |

## Related Spec

[SPEC-073: Settings UI Composition Layer](../specs/SPEC-073-settings-composition-layer.md)

## Related Decisions

- [ADR-072: Settings composition layer in `src/design/`](../decisions/072-settings-composition-layer-in-design.md)
- [ADR-035: Invert platform dependency and extract shared design layer](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md)

## Overview

Four phases. Phase 1 scaffolds the primitives, tokens, and CSS dedupe
with **no page migrations** — a green diff that only adds files and
removes duplicates, producing zero visual change. Phase 2 migrates one
simple page (General) as a spike to ratify the prop shapes. Phase 3
migrates the remaining simple pages. Phase 4 migrates the two complex
workbench pages.

No code lands in any phase until the owner has visually inspected the
affected page(s) and confirmed (per user preference: do not commit/push
until tested).

Only targeted tests run, never the full `npm test` suite (per
`cats-platform/CLAUDE.md` rule and user preference).

## Implementation Phases

### Phase 1 — Scaffolding (no visual change)

Goal: land the primitives and tokens so Phase 2 can import them, and
clean up duplicate CSS so existing pages show no regression.

- [x] **1.1** Create `src/design/components/settings/settings-tokens.css`
      with the Settings-scoped semantic tokens from SPEC-073
- [x] **1.2** Create `src/design/components/settings/settings.css` with
      the class contract from SPEC-073 (aliases onto existing
      `.contentCard`, `.statusChip`, `.heroNote`)
- [x] **1.3** Wire `settings-tokens.css` and `settings.css` into the
      renderer entry stylesheet (after ADR-035 design imports, before
      product-specific styles)
- [x] **1.4** Create `src/design/components/settings/`:
      - `SettingsSection.tsx`
      - `SettingsSectionHeader.tsx`
      - `SettingsOptionRow.tsx`
      - `SettingsActionBar.tsx`
      - `SettingsStatusChip.tsx`
      - `SettingsDangerZone.tsx`
      - `index.tsx` (barrel)
- [x] **1.5** Create `src/design/components/settings/README.md`
      with casing rules + one usage example per primitive
- [x] **1.6** Dedupe `.dangerButton`:
      - Confirm which of `forms.css:138` or `forms.css:189` is the
        canonical style (the "wanted" rules)
      - Delete the loser duplicate in `forms.css`
      - Delete `settings-shell.css:242`
      - Diff computed styles before/after on the Data and Assistants
        pages to confirm no pixel shift
- [ ] **1.7** Consolidate `.sectionLabel` and `.eyebrow`:
      - Grep all callsites of `.sectionLabel`
      - Pick the canonical class (proposal: `.eyebrow` in `panel.css`,
        aliased as `.settings-section-header__eyebrow`)
      - Either replace callsites or leave `.sectionLabel` as a
        legacy alias that applies the same rules as `.eyebrow`
        (decide during implementation; prefer alias to avoid churn)
- [x] **1.8** Replace hard-coded `#3a2c26` in `.settingsCheckboxLabel`
      with `var(--settings-text)` (= `var(--text)`)
- [x] **1.9** Typecheck cleanly (`npx tsc --noEmit`)

**Deliverables**: primitives importable from
`src/design/components/settings`, tokens defined, duplicate CSS removed,
no page migrated yet, no visible change on any existing page.

**Acceptance**: owner loads Settings in dev build, clicks through each
of the seven pages, confirms no visible regression.

### Phase 2 — General spike (API ratification)

Goal: migrate `PlatformSettingsGeneral.tsx` to the primitives; iterate
on prop shapes based on owner feedback before committing to a wider
rollout.

- [x] **2.1** Migrate `src/app/renderer/settings/PlatformSettingsGeneral.tsx`
      to use:
      - `<SettingsSection>` for "Lobby motion", "Guide Cat assist",
        "Profile" groupings
      - `<SettingsSectionHeader>` for the h2 + description
      - `<SettingsOptionRow asChoice>` for the lobby animation radios
      - `<SettingsOptionRow>` for toggles (inline layout, with the
        existing `.toggleRow` button as the `control`)
      - `<SettingsActionBar>` for any save/reset buttons
- [x] **2.2** Side-by-side visual review with owner (before vs after)
- [x] **2.3** Capture prop-shape feedback; update SPEC-073 if changes
      are needed; iterate until owner confirms (header required +
      headerless variant; --settings-body-size lowered; sub-card
      primitive added; field label restyle)
- [x] **2.4** Typecheck clean; commit only after owner confirmation

**Deliverables**: one page on primitives; prop-shape API locked for
Phase 3.

**Acceptance**: owner confirms visual parity + ergonomic satisfaction
with the authoring experience.

### Phase 3 — Simple pages

Goal: migrate the remaining simple pages. Each sub-task lands
separately so a single page's regression does not block others.

- [x] **3.1** Migrate `PlatformSettingsDesktopStartup.tsx`
      - Sections: startup behavior, system tray, window defaults
      - Owner review before commit
- [x] **3.2** Migrate `PlatformSettingsChat.tsx`
      - Sections: verbose messages, live progress, layout mode
      - `<SettingsOptionRow>` with `layout="stack"` for the
        concurrent-response-layout `<select>`
      - Owner review before commit
- [x] **3.3** Migrate `PlatformSettingsRuntime.tsx`
      - `<SettingsSection>` with a metrics grid inside (metrics
        layout is page-local CSS, not a new primitive)
      - `<SettingsStatusChip tone="ready|warm|muted">` for the chip
        row
      - Owner review before commit
- [x] **3.4** Migrate `PlatformSettingsData.tsx`
      - First real use of `<SettingsDangerZone>` for "Reset all data"
      - Verifies that the danger primitive covers the Data page's
        actions; adjust SPEC-073 if not
      - Owner review before commit

**Deliverables**: five of seven Settings surfaces on primitives; any
primitive gaps discovered get fed back to SPEC-073 before Phase 4.

**Acceptance**: owner visually approves each migrated page in turn.

### Phase 4 — Complex pages

Goal: migrate the two compound workbench pages. These are expected to
surface missing or under-specified primitives; capture those in a
SPEC-073 update before widening the API.

- [ ] **4.1** Migrate `src/app/renderer/settings/SettingsAssistants.tsx`
      - Use `<SettingsSection>` for the Guide Cat, Assistants list,
        Edit form sections
      - Use `<SettingsSectionHeader eyebrow title status>` for the
        "Guide Cat" / "Edit" header pattern
      - Where the workbench needs a nested card (edit form inside a
        section), wrap a second `<SettingsSection variant="form">`
        inside the parent and validate the visual result before
        promoting to a `<SettingsSubSection>` primitive
      - Form fields continue to use `.fieldLabel` + `.textInput`
        classes inside `<SettingsOptionRow control={…}>`
      - Owner review before commit
- [ ] **4.2** Migrate `src/products/shared/renderer/components/settings-cats/SettingsCats.tsx`
      and its sub-components:
      - `SettingsCatsRegistry.tsx`
      - `SettingsCatsDetailPanel.tsx`
      - `SettingsCatsDetailPanelContent.tsx`
      - `SettingsCatsCreateForm.tsx`
      - `SettingsCatsTransportPanel.tsx`
      - Confirm that importing from `src/design/components/settings/`
        from `products/shared/` does not violate any layer rule
        (ADR-035 / ADR-072 both explicitly allow it)
      - Owner review before commit
- [ ] **4.3** Post-Phase-4 audit:
      - Grep for remaining direct uses of `.contentCard`,
        `.contentCardHeader`, `.sectionLabel`, `.settingsCheckboxRow`
        inside Settings pages; decide whether to convert any stragglers
      - Decide whether to promote any ad-hoc patterns to new
        primitives (e.g., `<SettingsSubSection>`)
      - If new primitives are warranted, update SPEC-073 in place
        (not a new SPEC)

**Deliverables**: all seven Settings surfaces on primitives; any
primitives promoted or adjusted are reflected in SPEC-073.

**Acceptance**: owner visually approves; no Settings page renders a
duplicated pattern with bare CSS classes where a primitive exists.

## Files to Create/Modify

### Created

- `src/design/components/settings/index.tsx`
- `src/design/components/settings/README.md`
- `src/design/components/settings/settings-tokens.css`
- `src/design/components/settings/settings.css`
- `src/design/components/settings/SettingsSection.tsx`
- `src/design/components/settings/SettingsSectionHeader.tsx`
- `src/design/components/settings/SettingsOptionRow.tsx`
- `src/design/components/settings/SettingsActionBar.tsx`
- `src/design/components/settings/SettingsStatusChip.tsx`
- `src/design/components/settings/SettingsDangerZone.tsx`

### Modified (Phase 1)

- `src/design/components/forms.css` — remove duplicate `.dangerButton`
  at line 189
- `src/design/components/settings-shell.css` — remove `.dangerButton`
  at line 242; decide on `.sectionLabel` alias or removal
- `src/design/components/panel.css` — potentially extend `.eyebrow` to
  be the canonical eyebrow class used by the primitive
- Renderer entry stylesheet (wherever
  `src/design/components/settings-shell.css` is imported) — add new
  imports for `settings-tokens.css` and `settings.css`
- Wherever `.settingsCheckboxLabel` is defined — replace `#3a2c26`
  with `var(--settings-text)`

### Modified (Phase 2)

- `src/app/renderer/settings/PlatformSettingsGeneral.tsx`

### Modified (Phase 3)

- `src/app/renderer/settings/PlatformSettingsDesktopStartup.tsx`
- `src/app/renderer/settings/PlatformSettingsChat.tsx`
- `src/app/renderer/settings/PlatformSettingsRuntime.tsx`
- `src/app/renderer/settings/PlatformSettingsData.tsx`

### Modified (Phase 4)

- `src/app/renderer/settings/SettingsAssistants.tsx`
- `src/products/shared/renderer/components/settings-cats/SettingsCats.tsx`
- `src/products/shared/renderer/components/settings-cats/SettingsCatsRegistry.tsx`
- `src/products/shared/renderer/components/settings-cats/SettingsCatsDetailPanel.tsx`
- `src/products/shared/renderer/components/settings-cats/SettingsCatsDetailPanelContent.tsx`
- `src/products/shared/renderer/components/settings-cats/SettingsCatsCreateForm.tsx`
- `src/products/shared/renderer/components/settings-cats/SettingsCatsTransportPanel.tsx`

## Technical Decisions

- **Primitive home**: `src/design/components/settings/` mirrors the
  existing pattern where product-agnostic `.tsx` and `.css` live side
  by side under `src/design/components/` (see
  `AccordionSection.tsx` + `accordion.css`, `ConfirmDialog.tsx` +
  `confirm-dialog.css`). Justified in ADR-072.
- **No atomic-control wrappers**: `SettingsToggle` / `SettingsSelect` /
  `SettingsInput` / `SettingsRadio` / `SettingsTextarea` are **not**
  created. Atomic controls remain bare HTML with existing classes.
  Revisit only if Phase 4 shows a concrete need.
- **`<SettingsSubSection>` deferred**: not created in Phase 1. If
  Phase 4 shows a genuine use, promote during the Phase 4 audit.
- **Class contract uses both old and new names**: during migration,
  primitives render `className="contentCard settings-section"` so that
  legacy selectors keep working. A future SPEC retires the legacy
  class names once all consumers move.
- **No tests added in Phase 1**: per user preference, no primitive
  tests unless explicitly requested. Visual review is the acceptance
  gate.

## Testing Strategy

- **Manual visual review**: per-page, before each commit. Owner
  compares pre-migration and post-migration in dev build.
- **Targeted TS typecheck**: `npx tsc --noEmit` after each page
  migration to confirm no prop-shape regression.
- **No full test suite**: per `cats-platform/CLAUDE.md` and user
  preference. If targeted tests are needed for a specific primitive,
  the owner will request them explicitly.
- **Dedupe verification**: during Phase 1.6, use devtools computed
  styles on the Data page's "Reset all data" button and the
  Assistants page's "Remove" button to confirm no pixel-level
  regression after dedupe.

## Risks & Mitigations

- **`.dangerButton` dedupe shifts button margin or padding**
  *Impact*: Low.
  *Mitigation*: snapshot computed styles before the delete; if the
  "loser" duplicate had a rule the canonical one lacks, merge the
  rule into the canonical definition rather than losing it.

- **`<SettingsOptionRow>` asChoice variant does not cover a
  real-world radio layout**
  *Impact*: Medium; would require a Phase 3 rework.
  *Mitigation*: Phase 2 General page exercises `asChoice` end-to-end
  before Phase 3 begins; iterate then.

- **Complex pages (Assistants, My Cats) surface a missing primitive
  and force a SPEC change mid-rollout**
  *Impact*: Medium; expected, not surprising.
  *Mitigation*: Phase 4 explicitly treats SPEC-073 as mutable; update
  it in place rather than creating a second follow-up settings spec.

- **`products/shared/` importing from `src/design/components/settings/`
  is rejected by a layer-check rule we forgot about**
  *Impact*: Blocker for My Cats.
  *Mitigation*: confirm early in Phase 1 that `src/design/` is
  importable from `src/products/shared/` by reading ADR-035 + the
  existing `SettingsCats.tsx` imports; My Cats already consumes
  `src/design/components/*` classes, so the path is precedented.

- **Visual parity is "close but not identical" on some pages**
  *Impact*: Low, as long as the owner accepts the final look.
  *Mitigation*: each page's commit is gated on owner's explicit
  visual approval.

## Progress Log

| Date       | Update                                 |
|------------|----------------------------------------|
| 2026-04-18 | Plan created alongside SPEC-073 / ADR-072 |
| 2026-04-20 | Phase 3.1 complete — DesktopStartup migrated to primitives, owner-approved |
| 2026-04-21 | Phase 3.2 complete — Chat + Draft builder sections on primitives, owner-approved |
| 2026-04-21 | Phase 3.3 complete — Runtime page on primitives; `resolveRuntimeConnectionChip` returns `tone`; every section given a titled header with description |
| 2026-04-21 | Phase 3.4 complete — Data page on `SettingsDangerZone`. SPEC-073 tweak: danger-zone actions are direct children (no wrapper div); multi-button rows wrap in `<SettingsActionBar>` |

---

*Created: 2026-04-18*
*Author: Claude (for owner review)*
