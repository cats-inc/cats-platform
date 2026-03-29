# 2026-03-29 Cats A2A Pilot Alignment

Date: 2026-03-29
Topic: Mirror the validated `cats-runtime` A2A layering pilot into `cats`
Source:
- `cats-runtime/docs/plans/PLAN-023-a2a-layering-and-collaboration-artifact-alignment.md`
- `cats-runtime/docs/specs/SPEC-006-a2a-protocol-project-memory-and-skill-layering.md`
- `cats-runtime/docs/a2a/README.md`
- `project-bootstrap` March 2026 A2A refresh as candidate input only

## Summary

`cats` now acts as the sibling first-wave pilot repo for the same A2A layering
and same-environment collaboration model that was first validated in
`cats-runtime`.

The mirror is intentionally scoped:

- `cats` adopts the pilot-owned A2A v1.0 example-set structure
- `cats` adopts the same collaboration-layer split:
  - protocol artifacts in `docs/a2a/`
  - durable project memory in markdown docs
  - procedural collaboration behavior in `skills/`
- `cats` adds repo-owned collaboration skills for `a2a-handoff` and
  `project-memory-sync`

The mirror is intentionally not a production-default declaration:

- `cats` still has no live A2A endpoint
- the examples are pilot wire snapshots, not approved public contracts
- `project-bootstrap` remains a candidate input and is not modified here

## Relevance

This closes the gap where `cats-runtime` had already adopted the new pilot A2A
workflow while `cats` still carried the older optional `agent-card/task`
template wording.

The repo pair is now consistent enough to function as the first-wave pilot set
for future collaboration and bootstrap evaluation.

## Action Items

- Keep future A2A-facing `cats` work aligned with the pilot-owned example set
  unless a later ADR/spec intentionally changes the contract.
- Treat any future live A2A implementation work as a new product/runtime design
  step, not as automatic approval of the current examples.
- Revisit bootstrap merge-back only after more pilot loops exist across both
  repos.
