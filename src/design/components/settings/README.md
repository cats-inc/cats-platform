# Settings composition primitives

React components + CSS contract for Settings pages in `cats-platform`.
Paired with `SPEC-073` / `ADR-072` / `PLAN-065`.

Anything in this folder is the single source of truth for Settings
**structure** and **casing**. Changing a primitive or a token here
propagates to every Settings page.

## What is here

- `settings-tokens.css` — Settings-scoped semantic tokens (spacing,
  radius, type) aliasing `design/tokens.css`, `design/spacing.css`,
  `design/typography.css`. Color tokens alias existing primitives
  (`--text`, `--muted`, `--accent`, `--danger`); no new colors.
- `settings.css` — class contract (`.settings-section`,
  `.settings-section-header__*`, `.settings-option-row[data-…]`,
  `.settings-action-bar`, `.settings-status-chip`,
  `.settings-danger-zone__*`).
- `SettingsSection.tsx`, `SettingsSectionHeader.tsx`,
  `SettingsOptionRow.tsx`, `SettingsActionBar.tsx`,
  `SettingsStatusChip.tsx`, `SettingsDangerZone.tsx` — the six
  primitives.
- `index.tsx` — public barrel.

## What is **not** here (by design)

- `SettingsToggle` / `SettingsSelect` / `SettingsInput` /
  `SettingsRadio` / `SettingsTextarea` — atomic controls stay as
  bare HTML with the existing `.textInput`, `.toggleRow`,
  `.primaryButton`, `.secondaryButton` classes.
- `SettingsSubSection` — card-in-card is not institutionalized
  until a real page proves the shape.

If the current six primitives cannot express what a page needs,
raise the gap in `SPEC-073`; do not invent a seventh primitive
in-line.

## Casing rules

- **Page title (h1)** — Sentence case. Rendered by `PlatformSettingsShell.tsx`.
- **Section title (`<SettingsSectionHeader title>`)** — Sentence case.
- **Eyebrow (`<SettingsSectionHeader eyebrow>`)** — Authors may write
  any case; the class applies `text-transform: uppercase` + letter
  spacing.
- **Field label** — Sentence case.
- **Button label** — Sentence case.
- **Status chip label** — Sentence case.

## Primitive quick reference

### `<SettingsSection>`

Outer card for a coherent group of settings.

```tsx
<SettingsSection
  header={<SettingsSectionHeader title="Lobby motion" />}
>
  {/* rows or forms */}
</SettingsSection>
```

`header` is **required**. The framework enforces a header on every
section so titles, typography, and spacing stay consistent across pages.
For the rare case where a card is genuinely self-evident, opt out
explicitly with `headerless`:

```tsx
<SettingsSection headerless>
  {/* avatar + name only — no title needed */}
</SettingsSection>
```

Use `variant="form"` when the card is a form that should `align-self:
start` within a grid.

### `<SettingsSectionHeader>`

Canonical h2 treatment for a section. Optional eyebrow above, optional
right-aligned status chip, optional description below the title.

```tsx
<SettingsSectionHeader
  eyebrow="Guide Cat"
  title="Snowball"
  status={<SettingsStatusChip tone="ready">Active</SettingsStatusChip>}
  description="The cat that greets you in every surface."
/>
```

Use `nested` when rendering a card-in-card header; it promotes h2 → h3
and drops the title font size.

### `<SettingsOptionRow>`

One setting row. Three shapes:

```tsx
{/* inline: label on left, control on right (toggle / chip) */}
<SettingsOptionRow
  label="Show verbose messages"
  control={
    <button type="button" className="toggleRow" onClick={toggle}>
      <span className={on ? 'toggleDot toggleDotOn' : 'toggleDot'} />
    </button>
  }
/>

{/* stack: label above, control below (select / input / textarea) */}
<SettingsOptionRow
  layout="stack"
  label="Concurrent response layout"
  control={<select className="textInput">…</select>}
/>

{/* asChoice: wraps in a <label>, radio/checkbox first, label stacked */}
<SettingsOptionRow
  asChoice
  label="Off"
  description="Keep the Lobby still."
  control={<input type="radio" name="lobby-mode" checked={…} />}
/>
```

### `<SettingsActionBar>`

Horizontal button group. Buttons remain bare `<button>` with
`.primaryButton`, `.secondaryButton`, `.dangerButton` classes.

```tsx
<SettingsActionBar>
  <button className="primaryButton" type="button">Save changes</button>
  <button className="secondaryButton" type="button">Cancel</button>
</SettingsActionBar>
```

### `<SettingsStatusChip>`

Status pill. Three tones map to existing
`.statusChipReady`, `.statusChipWarm`, `.statusChipMuted`.

```tsx
<SettingsStatusChip tone="ready">Active</SettingsStatusChip>
<SettingsStatusChip tone="warm">Ready to apply</SettingsStatusChip>
<SettingsStatusChip tone="muted">Disabled</SettingsStatusChip>
```

### `<SettingsDangerZone>`

Terminal section for destructive actions.

```tsx
<SettingsDangerZone
  title="Reset all data"
  description="Clears every cat, channel, and message on this machine."
>
  <button className="dangerButton" type="button" onClick={reset}>
    Reset everything
  </button>
</SettingsDangerZone>
```

## Feedback conventions

Settings pages **never** render inline feedback for value changes. No
`<p className="feedbackText">` glued under a card, no error string injected
next to a control, no `feedback?: string` prop slot on these primitives.

- Use `useToast()` / `<ToastContainer>` from `src/design/components/Toast.tsx`
  when a save needs acknowledgement or an error must surface.
- Default to staying silent on success when the UI already reflects the new
  state (toggle flipped, avatar re-rendered). Toast is for errors and for
  changes whose effect is not immediately visible.

See `SPEC-073` "Feedback Conventions" and `cats-platform/AGENTS.md`
"Settings UI Conventions" for the normative rule.

## Migration stance

During migration, primitives render BOTH the new class names
(`.settings-*`) and the legacy class names (`.contentCard`,
`.settingsActionRow`, `.settingsCheckboxRow`, `.statusChip*`) so
unchanged CSS keeps working. Later phases retire the legacy class
names once every Settings call-site uses a primitive.

See `PLAN-065` for the rollout order.
