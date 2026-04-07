# PLAN-033: Integrate Packaged Setup with Runtime Bootstrap

> Historical note only. This plan is no longer the accepted direction.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Historical / Superseded by [PLAN-040](./PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md) |
| **Owner** | Codex |
| **Reviewer** | User / packaging + runtime workstreams |

## Summary

This plan proposed making packaged setup completion depend on runtime bootstrap
scan/apply success before `setupCompleteAt` could be written.

That is no longer the accepted design.

## Why It Was Superseded

The old direction collapsed three concerns into one flow:

1. platform onboarding identity and product preference
2. runtime bootstrap/config materialization
3. post-setup runtime recovery

That produced the wrong UX and the wrong system boundary:

- setup could only complete if runtime bootstrap succeeded
- packaged users risked being sent back into onboarding when runtime health
  regressed later
- setup and product selectors were still vulnerable to showing non-usable
  fallback catalog options

The current direction in [PLAN-040](./PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)
is:

- `cats-platform` setup owns owner identity, optional Guide Cat, and first
  product choice
- `cats-runtime` owns runtime setup and remediation through its own `/setup`
  surface
- Guide Cat setup and in-product execution selectors must only show truthful
  currently usable targets
- once `setupCompleteAt` exists, later runtime failure is recovery, not a
  reason to re-enter onboarding

## Historical Takeaways

- A single packaged UI may still link to runtime setup or diagnostics when
  needed, but it must not become a second runtime-bootstrap system.
- Runtime availability can change after setup, so onboarding completion cannot
  be treated as a durable runtime-readiness proof.
- Product-supported provider catalogs and runtime-usable execution choices must
  remain separate concepts.

## References

- [PLAN-040](./PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)
- [SPEC-044](../specs/SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md)
- [SPEC-049](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)

---

*Created: 2026-03-30*  
*Superseded: 2026-04-07*
