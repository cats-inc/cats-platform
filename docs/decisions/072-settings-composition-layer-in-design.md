# ADR-072: Settings Composition Layer Lives in `src/design/`, Built on Tokens + Shared Classes + Minimal Compound Components

> Correct the drift in Settings UI by establishing a small, enforced
> composition layer (Section / Header / Row / ActionBar / StatusChip /
> DangerZone) under `src/design/components/settings/`, consuming the existing
> tokens and classes introduced by ADR-035. Do **not** create an app-local
> `_core/` and do **not** wrap every input in a React primitive.

## Status

Proposed

## Date

2026-04-18

## Context

[ADR-035](./035-invert-platform-dependency-and-extract-shared-design-layer.md)
extracted `src/design/` as the single source of truth for visual identity
(tokens, typography, spacing, layout) and seeded
`src/design/components/*.css` with cross-product primitives (`panel.css`,
`forms.css`, `badge.css`, `settings-shell.css`, and friends).

What ADR-035 did **not** define is a composition contract on top of those
tokens and classes. Settings pages still author the HTML structure of every
card, header, and row by hand. After ~6 months of feature work the Settings
UI has drifted to the point where the owner can name it a UX problem without
effort:

- `h2` is sometimes bare, sometimes preceded by a `.sectionLabel` eyebrow,
  sometimes accompanied by a right-aligned status chip, sometimes not
- `.dangerButton` is defined **three times** — twice in
  `src/design/components/forms.css` (lines 138 and 189, in the same file)
  and once in `src/design/components/settings-shell.css` (line 242) — with
  different `margin-top`
- `.sectionLabel` in `settings-shell.css` overlaps with `.eyebrow` in
  `panel.css`; both render an UPPERCASE small-letter-spaced pre-title but
  with different font sizes (0.7–0.78rem vs 0.75rem)
- Card padding is consistent (`.contentCard { padding: 16px }`), but nested
  list rows use ad-hoc paddings (`10px 12px`, `14px 0`, etc.) with no scale
- Border-radius values across Settings components: 10 (tabs), 12 (buttons
  and inputs), 16 (cards), 999 (chips). These are stable in practice but
  not named, so any adjustment is a grep-replace across multiple files
- Casing is inconsistent: page titles and section titles are sentence case,
  form labels sentence case, but eyebrow labels UPPERCASE — with no written
  rule explaining when to use which
- Hard-coded color `#3a2c26` appears in `.settingsCheckboxLabel` instead of
  the `var(--text)` token

The first natural reaction is to build a `SettingsPage` / `SettingsToggle` /
`SettingsSelect` primitive family inside
`src/app/renderer/settings/_core/` and migrate all pages onto it. Review
surfaced three structural objections against that plan:

### Objection 1 — wrong layer for the primitives

`My Cats` settings do **not** live under `src/app/renderer/settings/`. The
real home is
`src/products/shared/renderer/components/settings-cats/SettingsCats.tsx`,
because `My Cats` is a product-shared surface, not a platform-app surface.
It already consumes classes from `src/design/components/*` directly.

Putting a new `_core/` inside `src/app/renderer/settings/` would leave two
bad options: either `products/shared/` reverse-depends on `app/renderer/`
(violates layering established by ADR-035 Issue 1), or `My Cats` never
receives the shared primitives at all and the consistency goal fails. The
composition layer belongs at the same level as the tokens it consumes —
inside `src/design/`.

### Objection 2 — full React-primitive wrapping is overreach

The real structural mess is in **compound** shapes: card, header (h2 +
eyebrow + chip), row (label + description + control), action bar, status
chip, danger zone. The atomic controls (`<input>`, `<select>`, `<textarea>`,
`<button>`) are already styled acceptably by `.textInput`, `.toggleRow`,
`.primaryButton`, etc. Wrapping each control in a `SettingsToggle` /
`SettingsSelect` / `SettingsInput` / `SettingsRadio` / `SettingsTextarea`
component on day one triples the API surface, duplicates a working CSS
layer, and promises more than we can afford to maintain.

### Objection 3 — complex pages should not shape the first API

`SettingsAssistants.tsx` and `SettingsCats.tsx` are compound workbenches
(registries, detail panels, transport panels, create forms). They are the
least representative pages to drive a composition API. Letting them
pattern-set forces the primitives to absorb workbench-specific concepts
(tabs, multi-pane layouts) that the simple pages do not want.

## Decision

### 1. Composition layer home: `src/design/components/settings/`

New directory `src/design/components/settings/` holds:

- `settings.css` — class contract extending the existing tokens
  and classes (`.contentCard`, `.eyebrow`, `.statusChip`, `.textInput`,
  `.primaryButton`, `.dangerButton`, etc.)
- `settings-tokens.css` — Settings-scoped **semantic** tokens
  (`--settings-card-radius`, `--settings-section-gap`,
  `--settings-title-size`, `--settings-radius-{sm,md,lg,pill}`, …) that
  map to the primitive tokens from ADR-035 (`--space-*`, `--text-*`,
  `--danger`, `--text`, `--muted`, `--accent`)
- `*.tsx` — a fixed, small set of React compound components that render
  the class contract
- `README.md` — the written casing / usage rules

The directory mirrors the existing pattern where product-agnostic TS
components (e.g., `AccordionSection.tsx`, `ConfirmDialog.tsx`) live
alongside their `*.css` files inside `src/design/components/`.

### 2. First wave of primitives: 6 compound components, not 11

Ship these as the Settings composition API:

- `<SettingsSection>` — the outer card (equivalent to `.contentCard`) with
  header + body slots
- `<SettingsSectionHeader eyebrow? title status?>` — the canonical h2
  rendering, with optional UPPERCASE eyebrow above and optional right-aligned
  status chip
- `<SettingsOptionRow label description? control>` — a single setting row:
  label text, optional description, and a control slot (any bare `<input>`,
  `<select>`, `<button className="toggleRow">`, etc.)
- `<SettingsActionBar>` — a horizontal button group (primary, secondary,
  optional danger)
- `<SettingsStatusChip tone="ready | warm | muted">` — a wrapper over
  `.statusChip` variants from the design layer
- `<SettingsDangerZone>` — a terminal section with red-trimmed header and
  destructive actions (used by Data → Reset all data, etc.)

**Explicitly excluded from Phase 1:**

- `SettingsToggle`, `SettingsSelect`, `SettingsInput`, `SettingsRadio`,
  `SettingsTextarea` — controls stay as bare HTML elements with existing
  classes
- `SettingsSubSection` — kept on the backlog. Card-in-card is not
  institutionalized until a real page can prove it is the right shape.
  Specific complex pages (Assistants / My Cats) may use a
  `<SettingsSection>` inside another `<SettingsSection>` ad hoc; promoting
  that to a named primitive requires evidence.

### 3. Casing rules (written, enforced by primitive defaults)

- **Page title** — Sentence case ("General", "My cats"). Rendered by the
  outer shell's `<h1>`, not a primitive in this wave.
- **Section title** (h2 inside `<SettingsSectionHeader title=…>`) —
  Sentence case.
- **Eyebrow** (small pre-title) — authored in any case; the
  `.settings-section-header__eyebrow` class applies
  `text-transform: uppercase` and letter-spacing. Devs pass free-form
  strings; the component enforces casing visually.
- **Field label** — Sentence case.
- **Button label** — Sentence case.
- **Status chip text** — Sentence case.

### 4. Semantic tokens, not a new color system

Do not introduce a Settings-specific color palette. Alias the existing
design-layer primitives (`--text`, `--muted`, `--muted-soft`, `--accent`,
`--accent-soft`, `--danger`, `--danger-hover`, `--border`, `--panel`,
`--panel-hover`, `--panel-subtle`, `--ready-*`, `--warm-*`, `--muted-*`).

Only spacing, radius, and type get Settings-scoped semantic aliases
(`--settings-card-padding`, `--settings-section-gap`,
`--settings-radius-{sm,md,lg,pill}`, `--settings-{page-title,title,eyebrow,label,body,hint}-size`,
…). This makes "change the padding on every Settings card" a one-line
diff.

### 5. Dedupe during Phase 1 (no behavior change expected)

- Keep exactly one `.dangerButton` definition, in `forms.css`; delete the
  duplicate at `forms.css:189` and the copy at `settings-shell.css:242`
- Consolidate `.sectionLabel` (in `settings-shell.css`) and `.eyebrow`
  (in `panel.css`) into one canonical class used by
  `<SettingsSectionHeader>`
- Replace hard-coded `#3a2c26` in `.settingsCheckboxLabel` with
  `var(--text)`

### 6. Migration order — simple pages first, complex pages last

1. `PlatformSettingsGeneral.tsx` — **spike**, ratifies prop shapes
2. `PlatformSettingsDesktopStartup.tsx`
3. `PlatformSettingsChat.tsx`
4. `PlatformSettingsRuntime.tsx`
5. `PlatformSettingsData.tsx` — first real use of `<SettingsDangerZone>`
6. `SettingsAssistants.tsx` — first complex page
7. `products/shared/renderer/components/settings-cats/SettingsCats.tsx` —
   last, because it confirms the cross-product claim of this ADR

Each step lands only after the owner visually inspects the page and
confirms it. No commit without confirmation (see
`feedback_no_commit_until_tested`).

## Consequences

### Positive

- Settings stops drifting: changing
  `src/design/components/settings/*.tsx` or `settings-tokens.css`
  propagates everywhere, instead of requiring grep-edits across pages
- `My Cats` and any future Work/Code settings surfaces can consume the
  same primitives without crossing layer boundaries
- The written casing guide removes a recurring class of review nit
- Dedupe of `.dangerButton` removes a latent source of subtle
  regressions when one branch edits one copy and not the other
- API surface stays small (6 components), which is credible to maintain

### Negative

- One more layer to learn for anyone editing a Settings page
- Complex pages (Assistants, My Cats) will likely surface a missing
  primitive during Phase 4; we will have to extend the SPEC then
- Visual diff risk during dedupe — `.dangerButton` copies have slightly
  different `margin-top` values, so one page's button spacing will shift
  by a few pixels when we pick the canonical definition

### Neutral

- Runtime behavior does not change
- No new npm dependency; no CSS framework
- Outside Settings, the broader UI is untouched by this ADR
- Existing `src/design/components/*.css` files (`panel.css`, `forms.css`,
  `badge.css`, `settings-shell.css`) are extended, not replaced

## Alternatives Considered

### Alternative 1 — Put primitives in `src/app/renderer/settings/_core/`

- **Pros**: obvious collocation with the majority of Settings pages
- **Cons**: `SettingsCats.tsx` lives in `products/shared/`; either it can't
  consume the primitives, or `products/shared/` reverse-depends on
  `app/renderer/`, violating ADR-035's layering
- **Why rejected**: breaks the layer model; forces `My Cats` to stay
  inconsistent forever

### Alternative 2 — Full React-primitive wrapping (Toggle / Select / Input / Radio / Textarea on day one)

- **Pros**: maximum enforcement — every control is a typed component
- **Cons**: triples the API surface before we know which variants matter;
  duplicates classes (`.textInput`, `.toggleRow`) that already work; locks
  the HTML shape of controls that currently benefit from native `<select>`
  a11y; inflates the migration-per-page diff
- **Why rejected**: the drift is in compound shapes, not atomic controls.
  Wrap the compound shapes, not the atoms.

### Alternative 3 — CSS-only dedupe (no React compound components)

- **Pros**: smallest diff; zero TypeScript churn
- **Cons**: the HTML structure of `<header>` / `<section class="contentCard">`
  / nested labels is still hand-authored on every page; drift returns the
  next time someone adds a page
- **Why rejected**: the owner's explicit goal is "改一處全動". CSS dedupe
  alone does not deliver that; only compound components do.

### Alternative 4 — Defer the composition layer until Work/Code add Settings

- **Pros**: zero cost today
- **Cons**: Settings is already drifting; each new page adds mass to the
  eventual migration; the reviewer and owner both called the drift as a
  present UX problem, not a hypothetical future one
- **Why rejected**: cheaper to establish the layer now, with 7 pages, than
  later with 15+

### Alternative 5 — Adopt a third-party component library (Radix, shadcn/ui, HeadlessUI)

- **Pros**: well-documented compound components out of the box
- **Cons**: same reasoning as ADR-035 Alternative 2: current custom
  properties and classes are sufficient at this scale, and the existing
  visual identity would have to be re-expressed in the library's idiom
- **Why rejected**: the problem is a written contract, not missing library
  features

## References

- [ADR-035](./035-invert-platform-dependency-and-extract-shared-design-layer.md)
  — extracted `src/design/` tokens and `src/design/components/`
- [SPEC-073](../specs/SPEC-073-settings-composition-layer.md) — primitive
  prop shapes, tokens, casing rules, class contract
- [PLAN-064](../plans/PLAN-064-settings-composition-layer-rollout.md) —
  phased rollout and migration order
- [CLAUDE.md](../../CLAUDE.md) — shared visual primitives may live in
  `src/design/**`; do not upstream product-specific behavior prematurely

---

*Proposed: 2026-04-18*
*Decision makers: user + Claude*
