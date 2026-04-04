# SPEC-015: Cat Capability Registry and Runtime Skill/MCP Mapping

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Ready for Specialist Handoff) |
| **Owner** | Codex |
| **Reviewer** | User / chat-capability workstream |

## Summary

`cats` already stores `skillProfile` and `mcpProfile` on cats and channels,
but those fields are still mostly labels. The product now needs a clearer
capability registry that can explain:

- what a given cat is meant to do
- which runtime-managed skills it should request
- which MCP/tool profile it should expose
- how the `Boss Cat` should reason about assignment and delegation

The registry should stay product-owned at the mapping level, while skill
delivery remains runtime-owned.

## Goals

- define a product-owned capability registry for cats
- map product capability profiles to runtime skill and MCP selections
- support multi-cat assignment and delegation decisions with explicit metadata
- align with `cats-runtime` runtime-managed skills direction

## Non-Goals

- building a general plugin marketplace
- making `cats` the owner of runtime skill delivery mechanics
- fully implementing delegation policies in this specification

## Requirements

### Functional Requirements

1. `cats` shall define a capability-registry seam that maps product-level
   cat profiles to runtime skill selections and MCP profiles.
2. The registry shall support at least:
   - cat-level default capability declarations
   - channel-level overrides
   - `Boss Cat` orchestration-aware selection metadata
3. The capability registry shall distinguish:
   - persona and role metadata visible in the product
   - runtime skill selections sent to `cats-runtime`
   - MCP/tool exposure metadata
4. The registry shall allow cats with no explicit profile to fall back to a
   chat-default capability set.
5. `Boss Cat` assignment logic shall be able to consult this registry when
   choosing which cat to add or route work toward.
6. Runtime skill delivery shall remain inside `cats-runtime`; `cats`
   provides mappings, not backend-specific skill materialization.

### Non-Functional Requirements

- **Boundary ownership**: runtime skill resolution stays in `cats-runtime`
- **Extensibility**: new cat types, skill bundles, and MCP profiles should be
  addable without redesigning the chat shell
- **Observability**: capability mappings should be inspectable in settings or
  debug surfaces later

## Design Notes

Suggested mapping layers:

1. `Cat persona`
   - name
   - visible role
   - product-facing description
2. `Capability profile`
   - delegation hints
   - preferred work types
   - approval sensitivity
3. `Runtime skill selection`
   - explicit named skills to request from `cats-runtime`
4. `MCP profile`
   - which tool surface is intended for that cat

This lets `cats` stay opinionated about product behavior while still
delegating runtime-owned execution details outward.

## Dependencies

- [SPEC-006](./SPEC-006-cats-core-v1-and-platform-foundation.md)
- [SPEC-011](./SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
- [ADR-014](../decisions/014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)
- [cats-runtime SPEC-005](../../../cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md)

## Open Questions

- [ ] Should capability profiles live only in settings data, or also surface in
      `Cats Core v1` actor metadata?
- [ ] Should `Boss Cat` choose cats strictly from capability tags, or also from
      learned runtime performance history later?

## References

- [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md)
- [terminology.md](../terminology.md)

---

*Created: 2026-03-19*
*Author: Codex*
