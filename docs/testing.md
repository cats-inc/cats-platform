# Testing Strategy

> Testing approach, standards, and procedures for `Cats`.

## Overview

The current focus is smoke and integration coverage around the Node server and
shared app-shell contract. The renderer now drives real chat flows, but it
is still covered indirectly through server and state integration tests. The
Telegram transport seam is also covered directly at the platform-module level
so dedupe, durable mapping, and webhook behavior can advance without touching
chat-core tests. Current regression coverage also targets chat-entry wake
behavior, direct-cat default routing, and re-wake flows for sleeping room
participants.

## Test Types

### Smoke and Integration Tests

- **Location**: `tests/*.test.js`
- **Framework**: `node:test`
- **Scope**: Built server endpoints, runtime-backed chat mutations, and
  file-backed store behavior, including Telegram status/webhook routes and
  restart durability for relay state

### Future Unit Tests

- **Location**: `tests/` or `tests/unit/`
- **Framework**: `node:test`
- **Scope**: Pure chat-state, orchestration, persistence modules, and transport
  seams such as Telegram dedupe/mapping without booting the full server

### Future Renderer Tests

- **Location**: `src/renderer/**` or `tests/ui/`
- **Framework**: TBD
- **Scope**: Channel switching, runtime banners, orchestrator shell behavior,
  and richer productization interactions

## Running Tests

### All Tests

```bash
npm test
```

This builds the TypeScript source and then runs the Node built-in test runner
against the compiled output.

### Build Verification

```bash
npm run build
```

This is the current production-bundle smoke check. It is still run manually;
the CI workflow does not yet build the Vite bundle.

## Mocking Guidelines

- Prefer in-process stub objects for runtime clients
- Prefer local temp directories for file-backed chat-store coverage
- Avoid heavy mocking libraries unless the product surface grows enough to need
  them

## CI/CD Integration

- Tests run automatically on:
  - [x] Pull requests
  - [x] Main branch commits
  - [ ] Production bundle build verification
  - [ ] Scheduled (nightly)

---

*Last updated: 2026-03-21*
