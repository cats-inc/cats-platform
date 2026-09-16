# ADR-116: Share Desktop Provider Management across Onboarding and Settings

## Status

Accepted — 2026-09-16. The user authorized documentation, implementation,
incremental commits, auto-merge, a version bump, and an unsigned Desktop preview.

Amended — 2026-09-17 after user acceptance. That release authorization is no
longer ongoing: do not bump versions or publish without a new user request.

## Context

Desktop currently separates selection checkboxes from installer cards. A card's
Detect action scans the entire selection, Settings cannot add a provider in
place, and Desktop consumes only the latest scan rather than Runtime's retained
observations. Saving an unrelated selection change can therefore erase visible
detection history. The packaged installers also predate upstream maintenance.

## Decision

1. Onboarding and Settings > Runtime share browser-safe selection and action
   logic, with distinct presentation. Onboarding retains its original compact
   four-column cards, native/local-model and Node/npm grouping, initial
   Claude/Antigravity/Node/Codex choices, and Show more expansion. Settings can
   use rows. Both show short status and next actions first; technical details
   and maintenance actions are collapsed.
   The first-run view must work before the Platform renderer is available.
2. Each provider row combines draft selection, saved selection, the last
   observation with its time, and relevant actions. Missing configuration starts
   with no selections; an existing selection is loaded without expansion.
3. Apply saves through Runtime with an expected revision. An adjacent checkbox
   controls subsequent detection, initially on in first-run and off in Settings.
   Saving never installs software. A valid empty selection completes bootstrap.
4. Explicit detection and post-install verification target only the requested
   saved target. Passive polling never starts probes. Unchanged observations
   survive unrelated saves; changed settings require a new observation.
5. Desktop owns allowlisted OS helpers and prerequisites. Its read-only Node.js,
   npm prefix/PATH and GitHub CLI checks run independently of provider selection;
   a clean consumer computer cannot be assumed to have these installed. Their
   results are retained separately, and installation still needs an explicit
   user action. Runtime owns selection,
   admission, and observations. Helpers cannot bypass selection or operate on
   remote/custom targets merely because they have a familiar provider name.
6. Installation, authentication, and endpoint connectivity remain distinct.
   Service targets expose endpoint configuration and explicit connection checks.
   Unsupported automatic installation offers instructions instead of a fake
   Install button. Existing advanced targets are preserved.
7. Long actions have visible per-row progress. The footer remains in one place;
   applying a valid selection permits Continue even with missing providers.
   Explicit Continue owns navigation, so scans and installs cannot eject users
   from onboarding. Settings uses its existing toast channel for action feedback.
8. Port relevant environment-bootstrap behavior into Cats-owned structured
   helpers, recording source revisions and intentional differences. A successful
   shell exit cannot hide a failed upgrade. Native Windows/macOS/Linux behavior
   is in scope; unrelated machine-wide setup features are inventoried separately.

This extends ADR-115 and the shared Runtime PLAN-039; it does not create another
selection authority. OS installation remains owned by Desktop (ADR-021).

## Consequences

- One state/action implementation prevents onboarding/Settings drift.
- Cross-editor conflicts, operation admission, and partial failures remain
  visible instead of silently overwriting settings or claiming readiness.
- Browser-only clients retain Runtime setup access without local installer IPC.
- Release validation must cover the packaged shared view and all helper assets.
- Native installer checks use isolated fixtures; actual installations and sign-in
  are user-controlled. CI packaging is not evidence of interactive OS installation.

## Alternatives Considered

- Separate selection and installer lists: duplicates identity and hides scope.
- Scan all supported providers to preselect installations: violates user intent.
- Load the complete Platform UI for first-run setup: adds a dependency on the
  service whose initial setup the host must be able to recover.

## References

- [ADR-115](./115-bound-bootstrap-and-provider-choices-by-runtime-selection.md)
- [SPEC-116](../specs/SPEC-116-desktop-provider-management.md)
- [PLAN-107](../plans/PLAN-107-desktop-provider-management.md)
- [Runtime PLAN-039](../../../cats-runtime/docs/plans/PLAN-039-provider-selection-bootstrap-rollout.md)
