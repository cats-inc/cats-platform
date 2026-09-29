# PLAN-115: App Components and Private Services

## Status

Architecture correction documented, 2026-09-29; executable work not started.
[ADR-125](../decisions/125-own-multiple-frontends-and-backends-in-one-app.md) and
[SPEC-122](../specs/SPEC-122-app-components-and-private-services.md) govern this work.
Coordinate with [PLAN-112](PLAN-112-app-market-and-lifecycle.md) for the same App
registry/lifecycle machinery, not a second installer.

## P0 — Freeze the component contract

- [x] Record one App with multiple frontends/backends and unified management.
- [x] Separate ordinary App-owned service requests from Cats host SDK capabilities.
- [ ] Freeze versioned manifest collections, dependency graph, route declarations,
  component runtime/trust, bounds, lifecycle and migration hooks.
- [ ] Freeze isolated serving origins, private service discovery/auth and external
  ingress policy. Keep host credentials outside App frontend authority.
- [ ] Map current manifest/registry state to the new contract; record compatibility
  and executable upgrade/recovery fixtures before changing persistence.

## P1 — Install and supervise one complete App

- [ ] Extend validation/build artifacts and host install transaction for all
  components, with no install-time source builds or separate backend product.
- [ ] Implement dependency-aware readiness, bounded supervision, generation
  revocation and coordinated stop/disable/remove/repair.
- [ ] Implement data migration/backup/activation recovery with PLAN-112.

## P2 — Native frontend/service communication

- [ ] Serve multiple frontends on the installation's isolated origin; route
  ordinary HTTP and declared streams to its services without App-domain SDK APIs.
- [ ] Verify per-App/owner identity, backend discovery, cross-origin denial,
  stale-generation revocation, and host-capability permission boundaries.
- [ ] Complete two-frontend/two-service/worker fixture acceptance. A one-page,
  one-service Ask prototype alone does not validate general cardinality.

## P3 — Ask consumer and external ingress

- [ ] cats-apps packages Ask UI, question storage/API and MCP together, depending
  on the published/versioned host contract rather than sibling source imports.
- [ ] Select and implement integrated public ingress for the local Ask endpoint;
  show connection setup/status inside Ask. No separate backend installation.
- [ ] Verify real Bot read/submit with request correlation and reopening/Copy.
  Keep manual Bot initiation, unavailable save timestamps and unverified video
  understanding explicit. Local host shutdown still bounds local availability.

## Validation and delivery

Documentation-only work uses diff/link checks and independent review. Executable
changes require focused package, process, routing, migration and host tests from
SPEC-122, including supported OSes and existing Apps. Use isolated state; no user
registry mutation or publication is authorized by this plan. Record actual checks
at handoff; do not describe this planning checkpoint as implemented support.

2026-09-29 documentation checkpoint: Apps `check:docs` passed (42 Markdown
files, 159 local targets; 39 absent sibling links skipped). A separate mapped
check across the coordinated worktrees found all 1,338 targets in 36 changed
Markdown files, including sibling/new-document targets. Both component worktrees
passed `git diff --check`. Independent review found authorization-owner and
migration-owner wording conflicts; both were corrected and rechecked with no
remaining blocker. No application tests/builds, live registry writes or product
publication were performed for this documentation correction. The user then
authorized documentation-only commits and direct pushes to main.
