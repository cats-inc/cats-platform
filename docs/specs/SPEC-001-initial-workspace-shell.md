# SPEC-001: Initial Workspace Shell

## Summary

Create the first runnable `cats-inc` slice as a Node.js/TypeScript service that
exposes runtime-aware health and an explicit bootstrap workspace shell payload.

## Goals

- Bootstrap the new `cats-inc` subproject with real project metadata
- Prove `cats-inc` depends on `cats-runtime`
- Publish a minimal app-level contract that keeps the future workspace shape
  explicit

## Requirements

### Functional Requirements

- `GET /health` returns app health plus `cats-runtime` reachability
- `GET /api/app-shell` returns a bootstrap workspace payload
- The payload makes channels, global orchestrator state, and planned
  capabilities visible

### Non-Functional Requirements

- Use built-in Node APIs only for the first slice
- Keep runtime integration isolated behind a dedicated client module
- Add at least one automated test

## Out of Scope

- Real browser UI
- Persistent storage
- Session creation and message streaming
- Direct `agent-fleet` integration

## Acceptance Criteria

- `cats-inc/` exists as a Node/TS subproject
- The service builds with TypeScript
- Automated tests verify the health and shell endpoints

---

*Last updated: 2026-03-11*
