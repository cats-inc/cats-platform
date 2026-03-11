# Testing Strategy

> Testing approach, standards, and procedures for `cats-inc`.

## Overview

The current focus is smoke and integration coverage around the Node server and
shared app-shell contract. The renderer now drives real workspace flows, but it
is still covered indirectly through server and state integration tests.

## Test Types

### Smoke and Integration Tests

- **Location**: `tests/*.test.js`
- **Framework**: `node:test`
- **Scope**: Built server endpoints, runtime-backed workspace mutations, and
  file-backed store behavior

### Future Unit Tests

- **Location**: `tests/` or `tests/unit/`
- **Framework**: `node:test`
- **Scope**: Pure workspace, orchestration, and persistence modules

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
- Prefer local temp directories for file-backed workspace store coverage
- Avoid heavy mocking libraries unless the product surface grows enough to need
  them

## CI/CD Integration

- Tests run automatically on:
  - [x] Pull requests
  - [x] Main branch commits
  - [ ] Production bundle build verification
  - [ ] Scheduled (nightly)

---

*Last updated: 2026-03-11*
