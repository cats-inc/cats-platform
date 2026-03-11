# Testing Strategy

> Testing approach, standards, and procedures for `cats-inc`.

## Overview

The current focus is smoke and integration coverage around the Node server and
shared app-shell contract. The renderer is still in the shell stage and is not
yet under dedicated component-test coverage.

## Test Types

### Smoke and Integration Tests

- **Location**: `tests/*.test.js`
- **Framework**: `node:test`
- **Scope**: Built server endpoints and bootstrap payloads

### Future Unit Tests

- **Location**: `tests/` or `tests/unit/`
- **Framework**: `node:test`
- **Scope**: Pure workspace, orchestration, and persistence modules

### Future Renderer Tests

- **Location**: `src/renderer/**` or `tests/ui/`
- **Framework**: TBD
- **Scope**: Channel switching, runtime banners, orchestrator shell behavior

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
