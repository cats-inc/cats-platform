# SPEC-005: Company Control Plane Evolution

Status: Draft (Exploratory, Unreviewed)

Note: This spec remains as exploratory Paperclip-informed research. It is not
the current execution path for the accepted `Cats Core v1` and Chat/Work
parallel-track plan.

## Summary

Evolve `cats` from a chat-first phase-2 shell into a broader company
control plane informed by the strongest Paperclip concepts: company-scoped work
hierarchy, explicit operator governance, workspace and execution modeling, and
output-first product surfaces.

This evolution must stay incremental. `cats` keeps `cats-runtime` as its
only execution boundary, preserves compatibility with the current workspace
shell where practical, and develops its own product model instead of copying
Paperclip packages or schemas directly.

## Goals

- Add company, work, governance, and output semantics above the current chat
  shell
- Keep chat as a first-class module without treating it as the entire product
- Preserve `cats-runtime` as the only runtime boundary
- Make the rewrite additive and migration-friendly rather than a flag-day reset

## Requirements

### Functional Requirements

- `cats` must introduce explicit product objects above channels, including
  company or workspace root scope, goals, projects, work items, activity,
  approvals, costs, and outputs.
- Chat channels must be attachable to work objects instead of remaining the
  only top-level operator entity.
- The current cat registry must be able to grow into a broader roster or org
  model with ownership and reporting context.
- Runtime executions, run history, and artifacts must be visible through
  product-owned read models hydrated from `cats-runtime`.
- `cats` must distinguish durable project workspaces from transient
  execution workspaces.
- Operator surfaces must follow progressive disclosure: summary first, then
  checklist or state detail, then raw transcript or tool output.
- The future architecture must leave room for plugins and alternate entrypoints
  without making them core rewrite blockers.

### Non-Functional Requirements

- `cats` must not import or depend on Paperclip runtime code, adapter
  orchestration, or database schema packages.
- Each rewrite phase must be shippable without breaking the current phase-2
  chat flows.
- Existing local workspace state must have a compatibility or migration story.
- Runtime-specific provider details must remain behind `cats-runtime`.

## Out of Scope

- Replacing `cats-runtime`
- Forking, skinning, or embedding Paperclip
- Building a full plugin marketplace in the first rewrite phases
- Full enterprise multi-tenant auth or SaaS packaging
- Turning `cats` into a pull-request review product

## Acceptance Criteria

- The Paperclip research, ADR, roadmap, spec, and plan all align on the same
  migration stance.
- A first implementation slice can land without breaking current chat-channel
  setup, activation, or transcript flows.
- The resulting product model supports a compatibility layer from today's
  workspace state into future control-plane objects.
- New operator surfaces can be added without moving runtime adapter or session
  ownership into `cats`.

---

*Last updated: 2026-03-16*

