# SPEC-116: Desktop Provider Management

## Metadata

| Field | Value |
|-------|-------|
| Status | Approved; implementation authorized 2026-09-16 |
| Owner / Reviewer | User |

## Summary

Onboarding and Settings > Runtime provide the same selection, detection,
installation, and repair experience. Runtime's persisted selection is the only
resource boundary. Users can finish initial setup now and add providers later.

## Goals

- Combine intent, observations, and next actions in one provider row.
- Complete Runtime bootstrap directly from Desktop.
- Make per-provider operations bounded and retain unrelated detection results.
- Bring native packaged helpers up to the relevant upstream maintenance baseline.

## Non-Goals

- Redesign WSL/Docker variants, change product onboarding/account semantics, or
  provision unrelated environment-bootstrap tools.
- Install providers, change credentials, or write test records in the user's
  existing development profile as an agent verification step.

## Functional Requirements

1. Read the static supported catalog and saved targets without provider probes.
   Show all supported choices, including unselected choices; preserve advanced
   targets and custom configurations while editing other targets.
2. Checkboxes mean desired use. Draft changes are explicitly applied; Detect and
   Install cannot use a newly checked target before that selection is saved.
3. Apply has a Detect after applying checkbox. Default on only for first-run,
   off for existing settings. Apply without detection performs no follow-up scan.
4. CLI observations distinguish never detected, installed, missing, failed, and
   configuration changed. Show observation time and unknown authentication
   honestly. Local/agent endpoints use connection wording rather than CLI status.
5. Detect one row scans that target only. Detect selected is a separate explicit
   batch action. Preserve other rows through subset scans and selection changes.
6. Install is explicit, uses a matching native helper and required prerequisites,
   and ends with target-scoped verification. Show helper failure/manual steps
   even if an older CLI is still installed. Update/repair/uninstall remain
   available through secondary controls; uninstall retains confirmation/preview.
7. Saving and probing have separate progress stages. Keep selection legible and
   footer actions stable. Do not announce full success before detection settles.
8. Valid nonempty and deliberately empty selections end Runtime bootstrap.
   Continue depends on saved valid intent, not every selected provider being
   ready. Empty or incomplete readiness is explained without trapping users.
9. Preserve cross-editor revision conflicts and operation admission. A late result
   cannot restore a deselected or reconfigured target. Do not duplicate scans
   from helper completion, UI polling, navigation, and catalog refresh.
10. Windows, macOS, and Linux share behavior and expose only supported helpers.
    Browser Settings retains links to the connected Runtime setup.

## Installer Integration

Port relevant version gates, corrected Windows Cursor/Kiro paths, Devin locked
file retry, Grok channel metadata, npm verification, and observed outcomes from
environment-bootstrap through 752dc13 (2026-09-16). Preserve Cats' noninteractive
execution, structured results, secret handling, and bounded selection.
Record already-covered and non-applicable changes in PLAN-107.

## Acceptance

- Clean first run: select two providers, Apply, see only those detections; install
  a missing one, verify only that one, then Continue without opening Runtime Setup.
- Empty selection can finish; unavailable selection can finish with an honest
  pending summary. Installation/login is never implied by saving intent.
- Settings adds a provider previously skipped during onboarding.
- Apply without detection preserves unchanged observations and launches no scan.
- Per-row retry and post-install verification leave unrelated observations intact.
- External edits conflict safely; busy targets cannot be deselected.
- All three release packages contain the shared manager and needed helper assets.
- Published unsigned preview metadata points to the new complete release.

## References

- [ADR-116](../decisions/116-share-desktop-provider-management-across-onboarding-and-settings.md)
- [PLAN-107](../plans/PLAN-107-desktop-provider-management.md)
- [SPEC-093](./SPEC-093-settings-runtime-cli-provider-lifecycle.md)

*Created: 2026-09-16*
