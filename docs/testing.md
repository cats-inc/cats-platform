# Testing Strategy

> Testing approach, standards, and procedures for `cats-inc`.

## Overview

Phase 1 focuses on smoke and integration tests around the initial HTTP shell.
The goal is to prove the new subproject starts cleanly, reports runtime status,
and exposes the planned workspace contract.

## Test Types

### Smoke and Integration Tests

- **Location**: `tests/*.test.js`
- **Framework**: `node:test`
- **Scope**: Built server endpoints and bootstrap payloads

### Future Unit Tests

- **Location**: `tests/` or `tests/unit/`
- **Framework**: `node:test`
- **Scope**: Pure workspace, orchestration, and persistence modules

## Running Tests

### All Tests

```bash
npm test
```

This builds the TypeScript source and then runs the Node built-in test runner
against the compiled output.

## Mocking Guidelines

- Prefer in-process stub objects for runtime clients
- Avoid heavy mocking libraries unless the product surface grows enough to need
  them

## CI/CD Integration

- Tests run automatically on:
  - [x] Pull requests
  - [x] Main branch commits
  - [ ] Scheduled (nightly)

---

*Last updated: 2026-03-11*
