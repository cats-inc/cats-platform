# Antigravity model and effort selection

Updated: 2026-09-16.

The operator supplied Antigravity CLI 1.2.3's seven-model picker and per-model
effort menus. [Runtime evidence and execution mapping](../../../cats-runtime/docs/research/2026-09-16-antigravity-model-picker-refresh.md)
record the source, account scope, raw-id provenance and catalog decisions.

Desktop's fallback now preserves the seven visible model names and order. None
is labeled default. The first model is Gemini 3.8 Flash. Runtime remains the
owner of live catalog data and execution-id mapping.

The `antigravity.effort` control uses its first applicable option when no value
is saved. It has no synthetic Default row and no default suffix. Flash offers
low/medium/high; Pro offers low/high; the other three models have no effort control.
Existing explicit effort survives reload, and switching models resets the choice.
Other providers' default controls are unchanged.

When an explicit Antigravity effort is selected, Desktop sends the structured
selection without also sending the family entry id as a legacy execution model.
Runtime returns the actual resolved model id. This avoids a mismatch between,
for example, the Pro family's low entry id and a selected high execution id.

Shared fallback-label consumers in execution chips and Chat participant/draft
tests now use the current Gemini entry. Independent persisted placeholder fixtures
remain separate from the current menu.

Validation: typecheck, server/UI-test builds and 165 focused selector/DOM,
display-consumer and Runtime client tests passed. Initial tests were corrected
to expect the new static menu and wait for initial target reconciliation before
interacting; the combined suite then passed. Tests create no
records in the user's persisted state. Installed Desktop was not launched.
