# SPEC-044: Integrate Packaged Setup with Runtime Bootstrap

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Historical / Superseded |
| **Owner** | Codex |
| **Reviewer** | User / packaging + runtime workstreams |

## Summary

This document captured an earlier packaged-app direction where platform setup
completion depended on runtime bootstrap/apply success.

That is no longer the accepted contract.

The current accepted direction is:

1. `cats-platform` setup owns owner identity, optional Guide Cat preference,
   and first product choice
2. `cats-runtime` owns runtime setup/remediation through its own `/setup` and
   diagnostics surfaces
3. setup and in-product provider/model selectors must only show truly usable
   runtime-backed choices, not fallback catalogs
4. after setup completes, later runtime failure is handled as recovery inside
   the product or host recovery surfaces, not by returning the user to
   onboarding

## Why The Original Direction Was Rejected

The original design made three assumptions that no longer hold:

- `setupCompleteAt` should depend on runtime bootstrap/apply success
- packaged onboarding and runtime recovery can be treated as one flow
- setup-time runtime checks provide a meaningful durable guarantee for later
  product entry

Those assumptions were rejected because runtime health is inherently mutable.
The runtime can disappear, lose auth, or lose providers after setup completes.
That means setup cannot be the long-term enforcement point for runtime
availability.

## Replacement Direction

Use the following documents instead of this one when implementing current work:

- [PLAN-040](../plans/PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)
- [SPEC-013](./SPEC-013-provider-catalog-consumption-and-ui-seam.md)
- [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)

In current design:

- the Guide Cat step may block inline on the absence of a usable runtime target
- the user may be directed to `cats-runtime /setup` from that inline state
- setup can still complete when Guide Cat is skipped
- post-setup runtime failures stay in product recovery or host recovery, not
  onboarding

## Historical Context

This file is retained so future readers understand why packaged setup should
not be re-expanded into a runtime-bootstrap gate.

---

*Created: 2026-03-30*  
*Superseded: 2026-04-07*
