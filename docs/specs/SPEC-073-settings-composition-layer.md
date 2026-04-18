# SPEC-073: Settings UI Composition Layer

> Defines the React primitives, Settings-scoped semantic tokens, CSS class
> contract, and casing rules that every Settings page inside `cats-platform`
> should use. Scope is Settings only; the rest of the renderer is out of
> scope for this SPEC.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | user |
| **Reviewer** | Codex |

## Summary

Settings pages today hand-author the HTML structure of every card, header,
row, and action bar. The result is measurable drift: `.dangerButton` is
defined three times in the design layer, `.sectionLabel` and `.eyebrow`
collide, h2 headers are rendered bare on some pages and wrapped with
eyebrow + chip on others, padding and radius values are hard-coded ad hoc.

This SPEC formalizes the smallest composition contract that unblocks
"change one place, update every Settings page": a six-component React
primitive set in `src/design/components/settings/`, a Settings-scoped
semantic token layer on top of the ADR-035 tokens, a written casing
guide, and a dedupe pass on colliding CSS.

## Goals

- One canonical pattern for Settings **card** / **header** / **row** /
  **action bar** / **status chip** / **danger zone**; adjusting a
  primitive propagates to every Settings page
- Settings-scoped semantic tokens (spacing / radius / type) so the owner
  can re-scale the whole Settings surface from one file
- A written casing guide embedded in the component directory, so new
  pages do not need to guess
- Dedupe `.dangerButton` triplication, consolidate
  `.sectionLabel`/`.eyebrow`, remove hard-coded colors
- Preserve the escape hatch: complex workbench pages (Assistants, My Cats)
  may nest `<SettingsSection>`s or fall back to raw classes where the
  primitive set is insufficient

## Non-Goals

- No primitive wrappers for atomic controls in this SPEC:
  `SettingsToggle`, `SettingsSelect`, `SettingsInput`, `SettingsRadio`,
  `SettingsTextarea` remain **out of scope**. Controls stay as bare HTML
  elements styled by existing classes (`.textInput`, `.toggleRow`,
  `.primaryButton`, `.secondaryButton`).
- No `<SettingsSubSection>` primitive shipped. Card-in-card is not
  institutionalized until an actual page proves the shape.
- No changes outside Settings. Chat, Work, Code main surfaces are not
  migrated by this SPEC.
- No runtime / API / data behavior changes. This SPEC is visual-structural
  only.
- No new color palette. Colors continue to come from ADR-035 tokens
  (`--text`, `--muted`, `--accent`, `--danger`, etc.).

## User Stories

- As the owner, I want to change the Settings card corner radius once
  and have every Settings page follow, so that visual iteration is cheap.
- As a developer adding a new Settings page, I want to import one
  component per structural shape and let it render the canonical markup,
  so that I do not need to re-derive classnames or recheck casing rules.
- As a reviewer, I want a short written guide covering casing and
  primitive choice, so that I can reject drift without opinion debate.

## Requirements

### Functional Requirements

- **FR-1**: Six React primitives live under
  `src/design/components/settings/`:
  `<SettingsSection>`, `<SettingsSectionHeader>`, `<SettingsOptionRow>`,
  `<SettingsActionBar>`, `<SettingsStatusChip>`, `<SettingsDangerZone>`.
- **FR-2**: Each primitive renders a documented CSS class contract
  (see *Class contract* below) and consumes Settings-scoped semantic
  tokens.
- **FR-3**: A `settings-tokens.css` file defines Settings-scoped
  semantic tokens, each mapping to an ADR-035 primitive token or
  fixed value. No new raw color values are added.
- **FR-4**: A `README.md` in the primitives directory documents the
  casing rules and each primitive's intended use, with one minimal
  usage example per primitive.
- **FR-5**: `.dangerButton` appears exactly **once** in the design
  layer after this SPEC lands. `settings-shell.css:242` and
  `forms.css:189` copies are removed.
- **FR-6**: `.sectionLabel` and `.eyebrow` are consolidated into one
  canonical class used by `<SettingsSectionHeader>`'s eyebrow slot.
- **FR-7**: Hard-coded `#3a2c26` in `.settingsCheckboxLabel` is
  replaced with `var(--text)` (or the equivalent semantic token).
- **FR-8**: `<SettingsStatusChip>` supports at minimum three tones:
  `ready`, `warm`, `muted`, mapped to the existing
  `.statusChipReady` / `.statusChipWarm` / `.statusChipMuted` classes.
- **FR-9**: `<SettingsDangerZone>` is the only primitive that surfaces
  `--danger` tokens and hosts the canonical `.dangerButton`.

### Non-Functional Requirements

- **Visual regression**: migrating a page to the primitives MUST NOT
  change the pixel layout beyond minor (≤2px) shifts attributable to
  the `.dangerButton` dedupe. Each migrated page goes through owner
  visual review before commit.
- **Layer discipline**: primitives MUST NOT import from
  `src/app/**`, `src/products/**`, or `src/platform/**`. They may
  depend only on tokens and classes from `src/design/` and on React.
- **Bundle cost**: no new npm dependencies. Primitives are plain React
  + existing CSS.
- **TypeScript**: strict mode; `interface` for prop shapes; no `any`.

## Design Overview

### Directory layout

```
src/design/components/settings/
  index.ts                      — public barrel (re-exports primitives)
  README.md                     — casing rules, usage guide
  settings-tokens.css           — Settings-scoped semantic tokens
  settings.css                  — class contract (BEM-ish naming)
  SettingsSection.tsx
  SettingsSectionHeader.tsx
  SettingsOptionRow.tsx
  SettingsActionBar.tsx
  SettingsStatusChip.tsx
  SettingsDangerZone.tsx
```

`src/design/index.css` (or the main renderer stylesheet) imports
`settings-tokens.css` and `settings.css` after the base tokens, in that
order.

### Primitive prop shapes

> These are **draft** interfaces for owner review. Names are final
> subject to PLAN-064 Phase 2 spike feedback.

```ts
// SettingsSection — outer card, wraps a coherent group of rows.
interface SettingsSectionProps {
  header?: ReactNode;        // typically a <SettingsSectionHeader/>
  children: ReactNode;       // rows, forms, or nested content
  className?: string;        // escape hatch
  /**
   * Visual variant. 'default' uses base card padding;
   * 'form' uses the same padding but self-aligns to start
   * (equivalent to today's .contentCardForm).
   */
  variant?: 'default' | 'form';
  id?: string;
}

// SettingsSectionHeader — the canonical h2 treatment.
interface SettingsSectionHeaderProps {
  title: string;                 // h2 text, sentence case
  eyebrow?: string;              // free-form string; CSS applies UPPERCASE
  status?: ReactNode;            // typically a <SettingsStatusChip/>
  description?: ReactNode;       // optional subtitle rendered below h2
  /**
   * If true, renders a smaller h3 instead of h2.
   * Reserved for nested sections (card-in-card); not used in
   * Phase 1 but scaffolded so we do not need a prop rename later.
   */
  nested?: boolean;
}

// SettingsOptionRow — a single setting row.
interface SettingsOptionRowProps {
  label: ReactNode;          // sentence case
  description?: ReactNode;   // optional helper text under label
  control: ReactNode;        // the interactive element
  /**
   * Layout direction of label vs control:
   * - 'inline' (default): label on left, control on right (toggle / chip)
   * - 'stack': label above, control below (select / input / textarea)
   */
  layout?: 'inline' | 'stack';
  /**
   * Renders the row as a choice (radio/checkbox) row with a top
   * border divider, replacing .settingsCheckboxRow usage.
   */
  asChoice?: boolean;
  htmlFor?: string;          // forwarded to the rendered <label>
}

// SettingsActionBar — horizontal button group.
interface SettingsActionBarProps {
  children: ReactNode;       // buttons; consumers provide bare <button>
                             // with .primaryButton / .secondaryButton /
                             // .dangerButton classes
  /** Visual weight / spacing variant. */
  tone?: 'default' | 'danger';
}

// SettingsStatusChip — small status pill.
interface SettingsStatusChipProps {
  tone: 'ready' | 'warm' | 'muted';
  children: ReactNode;       // label text, sentence case
}

// SettingsDangerZone — terminal section with destructive actions.
interface SettingsDangerZoneProps {
  title: string;             // sentence case, e.g. "Reset all data"
  description?: ReactNode;
  children: ReactNode;       // typically a <SettingsActionBar tone="danger">
}
```

### Settings-scoped semantic tokens

Defined in `settings-tokens.css`. Values below are **proposals**; exact
numbers to be reconciled against the current computed styles during
PLAN-064 Phase 1.

```css
:root {
  /* Spacing (maps to ADR-035 --space-*) */
  --settings-card-padding: var(--space-4);          /* 16px */
  --settings-section-gap: var(--space-4);           /* gap between sections */
  --settings-row-gap: var(--space-3);               /* label/description gap */
  --settings-row-padding-y: 14px;                   /* choice row vertical */
  --settings-action-gap: var(--space-2);            /* button-to-button */

  /* Radius */
  --settings-radius-sm: 10px;                       /* tabs */
  --settings-radius-md: 12px;                       /* inputs, buttons */
  --settings-radius-lg: 16px;                       /* cards */
  --settings-radius-pill: 999px;                    /* chips */

  /* Type scale (maps to ADR-035 --text-*) */
  --settings-page-title-size: 1.4rem;               /* h1 in PlatformSettingsShell */
  --settings-title-size: 1.1rem;                    /* section h2 */
  --settings-subtitle-size: 1rem;                   /* nested h3 */
  --settings-eyebrow-size: var(--text-xs);          /* 0.72rem */
  --settings-label-size: var(--text-sm);            /* 0.85rem */
  --settings-body-size: var(--text-base);           /* 1rem */
  --settings-hint-size: var(--text-xs);             /* 0.72rem */

  /* Letter-spacing */
  --settings-eyebrow-tracking: 0.08em;

  /* Shadow (maps to ADR-035) */
  --settings-card-shadow: var(--shadow);

  /* Color (aliases only, no new values) */
  --settings-danger: var(--danger);
  --settings-danger-hover: var(--danger-hover);
  --settings-text: var(--text);
  --settings-text-muted: var(--muted);
  --settings-border: var(--border);
  --settings-surface: var(--panel);
  --settings-surface-hover: var(--panel-hover);
}
```

### Class contract (`settings.css`)

BEM-ish naming under a shared `settings-` prefix to avoid collisions
with the existing `.settings*` classes during migration. Each primitive
renders the classes below.

- `<SettingsSection>` → `.settings-section[ data-variant="form"? ]`
- `<SettingsSectionHeader>` →
  `.settings-section-header`
  - `.settings-section-header__eyebrow` (applies `text-transform: uppercase`
    and `letter-spacing: var(--settings-eyebrow-tracking)`)
  - `.settings-section-header__title` (h2 or h3 when `nested`)
  - `.settings-section-header__status` (right-aligned slot)
  - `.settings-section-header__description`
- `<SettingsOptionRow>` →
  `.settings-option-row[ data-layout="inline|stack" ][ data-choice="true"? ]`
  - `.settings-option-row__label`
  - `.settings-option-row__description`
  - `.settings-option-row__control`
- `<SettingsActionBar>` →
  `.settings-action-bar[ data-tone="default|danger" ]`
- `<SettingsStatusChip>` →
  `.settings-status-chip[ data-tone="ready|warm|muted" ]`
  (a thin alias over the existing `.statusChip`/`.statusChipReady`/…)
- `<SettingsDangerZone>` →
  `.settings-danger-zone`
  - `.settings-danger-zone__title`
  - `.settings-danger-zone__description`
  - `.settings-danger-zone__actions`

Where the existing class does the right thing (`.contentCard`,
`.statusChip`, `.heroNote`, etc.), the new class applies in addition so
legacy consumers keep rendering correctly until they are migrated.

### Casing rules (normative)

- **Page title (h1)**: Sentence case. Examples: "General", "My cats",
  "Assistants", "Data".
- **Section title (h2 inside `<SettingsSectionHeader>`)**: Sentence case.
  Examples: "Lobby motion", "Provider status", "Reset all data".
- **Nested title (h3)**: Sentence case. Reserved for
  `<SettingsSectionHeader nested>` when card-in-card appears.
- **Eyebrow**: authored in any case; the `.settings-section-header__eyebrow`
  class applies `text-transform: uppercase`. The `letter-spacing` is
  `var(--settings-eyebrow-tracking)` (0.08em). Examples written by devs:
  "Guide Cat", "Edit".
- **Field label** (inside `<SettingsOptionRow label=…>` or any
  `.fieldLabel`): Sentence case. Examples: "Concurrent response layout",
  "Role hint", "Show verbose messages".
- **Button label**: Sentence case. Examples: "Save changes",
  "Create Guide Cat", "Remove".
- **Status chip label**: Sentence case. Examples: "Active", "Ready to
  apply", "Runtime ready".

### Usage example (before / after)

**Before** — excerpt from `PlatformSettingsGeneral.tsx`:

```tsx
<section className="contentCard">
  <h2>Lobby motion</h2>
  <p className="heroNote">Choose how lively the Lobby background feels.</p>
  {modes.map((mode) => (
    <label key={mode} className="settingsCheckboxRow">
      <input type="radio" name="lobby-animation-mode" checked={…} />
      <span className="settingsCheckboxMeta">
        <span className="settingsCheckboxLabel">{mode.title}</span>
        <span className="heroNote">{mode.description}</span>
      </span>
    </label>
  ))}
</section>
```

**After**:

```tsx
<SettingsSection
  header={
    <SettingsSectionHeader
      title="Lobby motion"
      description={<p>Choose how lively the Lobby background feels.</p>}
    />
  }
>
  {modes.map((mode) => (
    <SettingsOptionRow
      key={mode.id}
      asChoice
      label={mode.title}
      description={mode.description}
      control={
        <input
          type="radio"
          name="lobby-animation-mode"
          checked={…}
          onChange={…}
        />
      }
    />
  ))}
</SettingsSection>
```

**Before** — excerpt from `SettingsAssistants.tsx`:

```tsx
<section className="contentCard">
  <div className="contentCardHeader">
    <div>
      <p className="sectionLabel">Guide Cat</p>
      <h2>{guideCat ? guideCat.name : 'No Guide Cat configured'}</h2>
    </div>
    {guideCat ? <span className="statusChip statusChipReady">Active</span> : null}
  </div>
  …
</section>
```

**After**:

```tsx
<SettingsSection
  header={
    <SettingsSectionHeader
      eyebrow="Guide Cat"
      title={guideCat ? guideCat.name : 'No Guide Cat configured'}
      status={
        guideCat ? <SettingsStatusChip tone="ready">Active</SettingsStatusChip> : null
      }
    />
  }
>
  …
</SettingsSection>
```

### Class-contract compatibility

During migration, both the new `.settings-section` class and the legacy
`.contentCard` class render on the same node (`<SettingsSection>` outputs
`className="contentCard settings-section"`). This keeps legacy selectors
working while the new ones take over, and allows per-phase rollback to
the old class by dropping the primitive.

After all pages migrate (end of PLAN-064 Phase 4), a follow-up spec will
decide whether to retire the legacy class names; it is not part of this
SPEC.

## Dependencies

- ADR-035 shared design layer (tokens, typography, spacing, base
  component CSS) is the foundation this SPEC extends.
- ADR-072 is the architectural decision this SPEC implements.
- Existing CSS files under `src/design/components/` — specifically
  `panel.css`, `forms.css`, `badge.css`, `settings-shell.css` — are
  consumed and partially rewritten (dedupe) but not replaced.

## Open Questions

- [ ] **Radio/checkbox semantics** — Is `asChoice` on
  `<SettingsOptionRow>` the right escape, or should we ship
  `<SettingsChoiceRow>` as a separate primitive? Proposal: ship a
  variant now, promote only if PLAN-064 Phase 3 shows the variant is
  load-bearing for 2+ pages.
- [ ] **Token parity with ADR-035** — Should `--settings-radius-lg`
  stay as `16px` (current `.contentCard`) or be promoted to a general
  `--radius-lg` token under `src/design/` for reuse by non-Settings
  components? Proposal: keep Settings-scoped for now; promote when a
  second surface needs the same scale.
- [ ] **`<SettingsSubSection>` timing** — Do any Phase 3 pages
  (Desktop / Chat / Runtime / Data) genuinely want a nested card, or
  can they all flatten to one level? Revisit after Phase 3.
- [ ] **Barrel vs per-file imports** — `index.ts` barrel is convenient
  but harder to tree-shake. Proposal: ship the barrel; measure bundle
  cost at the end of migration.
- [ ] **Tests for primitives** — Do we add snapshot / render tests for
  the six components, given the owner's "no full suite" rule? Proposal:
  no tests in Phase 1 unless the owner asks; rely on visual review.

## References

- [ADR-072](../decisions/072-settings-composition-layer-in-design.md) —
  architectural decision
- [ADR-035](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md)
  — design layer extraction
- [PLAN-064](../plans/PLAN-064-settings-composition-layer-rollout.md) —
  rollout phases
- `src/design/tokens.css`, `src/design/typography.css`,
  `src/design/spacing.css`, `src/design/components/panel.css`,
  `src/design/components/forms.css`, `src/design/components/badge.css`,
  `src/design/components/settings-shell.css` — foundation this SPEC
  extends

---

*Created: 2026-04-18*
*Author: Claude (for owner review)*
*Related Plan: [PLAN-064](../plans/PLAN-064-settings-composition-layer-rollout.md)*
