# SPEC-006: Cats Core v1 and Suite Foundation

Status: Approved

## Summary

Define the minimum shared foundation required for `Cats Chat` and `Cats Work`
to ship from the same product model. The foundation consists of `Cats Core v1`,
the split between direct `cats-runtime` APIs and the future MCP facade, and the
product-owned handling of approvals, owner profile, external bot bindings, and
archive metadata.

## Goals

- Define the shared `Cats Core v1` scope
- Keep `cats-runtime` as the only runtime boundary
- Enable parallel Chat and Work delivery without schema drift
- Preserve compatibility with the current chat shell during migration

## Requirements

### Functional Requirements

- The suite must define shared records for identity, actors/resources,
  permissions, conversations, bot bindings, tasks/runs, approvals, owner
  profile, and archive metadata.
- `Cats Chat` must use those shared records rather than treating channel or pal
  state as a private, one-off schema.
- `Cats Work` must use those shared records rather than inventing a separate
  work-only identity or conversation model.
- Product-owned services must continue to call `cats-runtime` through direct
  APIs for operational control.
- Orchestrator-style agents must have a future MCP tool path to `cats-runtime`
  that does not bypass product-owned permissions or approval state.
- The suite must support one external orchestrator bot binding per public
  transport identity.
- The suite must support escalation, approval, and takeover state as
  first-class product data.
- Operational search must stay product-owned; archive/RAG remains a downstream
  pipeline rather than the live source of truth.

### Non-Functional Requirements

- `Cats Core v1` should remain small enough for fast parallel adoption.
- The migration should preserve current chat-shell behavior where practical.
- The suite should keep the full desktop surfaces on one Electron-hosted
  React/TypeScript path while the shared contracts are still settling.
- Mobile, if added, should begin as companion scope rather than a second full
  primary shell.
- Packaging should aim for a desktop-first native-feeling experience with local
  onboarding.

## Out of Scope

- Replacing `cats-runtime`
- Building a full standalone `Cats Core` platform before the first suite launch
- Shipping mobile-specific shells in this planning slice
- Turning exploratory Paperclip control-plane notes into the active execution
  plan

## Acceptance Criteria

- Accepted ADRs define `Cats Core v1` and the runtime API plus MCP split.
- Roadmap, progress, requirements, and architecture all describe the same
  shared suite direction.
- Chat and Work teams can identify which shared entities they must reuse.
- The first implementation plan can be broken down without reopening the
  contract-level decisions.

---

*Last updated: 2026-03-16*
