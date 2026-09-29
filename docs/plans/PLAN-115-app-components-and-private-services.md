# PLAN-115: App Components and Private Services

## Status

Shared-ingress candidate implemented and independently reviewed, 2026-09-29.
Local integration and installed Ask Windows Electron acceptance pass. Live
external tunnel/Bot, other operating systems and release compatibility remain
open. Changes are in `feat/app-components`; commit, push and an auto-merge PR
were authorized on 2026-09-29. Publication and version bumps are not authorized.
[ADR-125](../decisions/125-own-multiple-frontends-and-backends-in-one-app.md) and
[SPEC-122](../specs/SPEC-122-app-components-and-private-services.md) govern this work.
Coordinate with [PLAN-112](PLAN-112-app-market-and-lifecycle.md) for the same App
registry/lifecycle machinery, not a second installer.

## P0 — Freeze the component contract

- [x] Record one App with multiple frontends/backends and unified management.
- [x] Separate ordinary App-owned service requests from Cats host SDK capabilities.
- [x] Freeze versioned manifest collections, dependency graph, route declarations,
  component runtime/trust, bounds, lifecycle and migration hooks.
- [x] Record the initial private service discovery/auth prototype.
- [x] Amend ADR/SPEC for shared Platform/Mobile/App ingress and opaque App sandboxes.
- [x] Implement and locally validate the corrected serving/auth contract in P4.
- [x] Map current manifest/registry state to the new contract; record compatibility
  and executable upgrade/recovery fixtures before changing persistence.

## P1 — Install and supervise one complete App

- [x] Extend validation/build artifacts and host install transaction for all
  components, with no install-time source builds or separate backend product.
- [x] Implement dependency-aware readiness, bounded supervision, generation
  revocation and coordinated stop/disable/remove; same-version file repair remains
  a separate PLAN-112 follow-up.
- [x] Implement data migration/backup/activation recovery with PLAN-112.

## P2 — Initial local frontend/service communication (historical prototype)

- [x] Serve multiple frontends on the installation's isolated origin; route
  ordinary HTTP and declared streams to its services without App-domain SDK APIs.
- [x] Verify per-App/owner identity, backend discovery, cross-origin denial,
  stale-generation revocation, and host-capability permission boundaries.
- [x] Complete two-frontend/two-service/worker fixture acceptance. A one-page,
  one-service Ask prototype alone does not validate general cardinality.

## P3 — Ask consumer and external ingress

- [x] cats-apps packages Ask UI, question storage/API and MCP together, consuming
  a built/versioned candidate SDK tarball without sibling source imports. The
  required host contract is not published; release compatibility remains a gate.
- [x] Build a per-App ngrok prototype with connection setup/status inside Ask.
  This approach is superseded by P4; it is not shared-ingress acceptance.
- [ ] Verify real Bot read/submit with request correlation and reopening/Copy.
  Keep manual Bot initiation, unavailable save timestamps and unverified video
  understanding explicit. Local host shutdown still bounds local availability.

## P4 — Shared Platform ingress (next implementation sequence)

1. [x] Replace per-App ingress ownership with the Platform router and one host
   remote-access configuration. Extend existing ingress diagnostics/settings;
   keep internal component ports private. Define exact settings/auth bootstrap
   fields before coding, including remote owner-bound view launch.
2. [x] Mount `/apps/<appId>/` launch/UI/API/MCP routes; enforce canonical path
   validation, generation binding and auth-specific dispatch. Generate reachable
   base URLs from trusted host settings; preserve query/stream/MCP semantics.
3. [x] Replace same-origin iframe permission with the opaque sandbox, HTTP CSP,
   grant-based ordinary fetch and frame-bound bridge from SPEC-122. Validate
   Platform/other-App isolation and clipboard in actual browser/Electron.
4. [x] Move tunnel lifecycle to Platform. Disable/update/remove revokes only that
   App; implement validated/backed-up/atomic migration of prototype settings and
   reject unresolved account/domain conflicts without changing data.
5. [x] Coordinate Ask tutorial/status/connector URL changes with cats-apps
   PLAN-005 A4a; remove Ask-specific ngrok token setup. Keep manual Bot initiation
   and the existing question/receipt schema.
6. [ ] Pass one-origin/port/tunnel Platform + remote Mobile + two-App acceptance,
   including separate MCP paths, revocation, auth, streaming and restart tests.
   Only then repeat the actual Ask package and real Bot round trip. Track other
   OS execution separately; do not infer it from Windows fixtures.

## Validation and delivery

2026-09-29 shared-ingress candidate checkpoint:

- Code Canvas comparison: public ingress denies the internal Code MCP before
  dispatch, even with a bearer/no Origin and a loopback tunnel peer. Apps own
  their MCP handlers behind the transparent shared router. Canvas preview
  trust rules remain separate from the opaque App sandbox. ADR-126, SPEC-123
  and PLAN-116 now track Runtime's actual session MCP contract.
- Real Platform router fixture: Mobile auth, owner-bound remote App launch,
  two App/MCP mounts, query/protocol-header preservation, cross-App/Platform
  credential denial, one-App disable and logout-driven view revocation pass.
  This simulates the tunnel's HTTP side locally; no external HTTPS tunnel ran.
- Component fixtures cover multiple frontends/services/worker, data migration
  and retained reinstall, streams and the two-restart limit. Stream cancellation
  initially hung; forwarding upstream aborts to the downstream response fixed it.
  Windows fixture readiness/restart deadlines now allow bounded process startup.
- Ingress migration tests cover consistent/conflicting legacy settings, backups,
  injected atomic-rename failure, interrupted staging/restart, unavailable auth,
  late connection close and worker exit during setup. Gateway request/bridge
  revocation races have executable regressions.
- Existing App management/authority, SDK/ingress diagnostics and renderer/auth
  suites pass. Server/Desktop/renderer builds pass. Full test-project typecheck
  still requires the worktree's missing mobile packages; full CI is not claimed.
- Ask archive `0f3853ca845b5435faf2f091b79049d5f960c4f3921565501d06eb1bed91e217`
  passed isolated Windows Electron create → close → MCP get/submit → reopen →
  actual Copy/paste, denied-copy feedback and host settings navigation. The
  opaque frame cannot read host DOM/cookies/local storage. Screenshots were
  inspected; all content came from disposable fixtures.
- Independent reviewers found and rechecked fixes for lifecycle cleanup races,
  bridge revocation, navigation permission mapping, stale ingress UI and
  single-use launch retry. No remaining blocker in the reviewed candidate scope.
- No live Bot/tunnel, real registry/profile install, release, version bump or
  code commit/push. P4.6 remains open for external and cross-OS acceptance.
- Documentation checks: 9 changed Markdown files / 59 mapped local targets,
  no missing link targets; Apps check covers 43 files / 161 local targets.
  Both worktree whitespace checks pass. Production CLI/shutdown regressions
  pass all 11 cases.

Historical shared-ingress documentation checkpoint: the user requested documents first.
P4 above is the next implementation sequence. No executable changes, user config
changes, new application builds/tests or live tunnel activity are part of this
correction. Historical counts below are evidence for the prior local prototype.

Documentation validation: Apps `check:docs` passed (43 Markdown files, 161 local
targets; 39 unavailable sibling links skipped). The mapped check across these
36 changed documents resolved all 1,244 local/sibling targets; both diffs passed
whitespace checks. Independent reviews found an ADR-126 ingress conflict,
overstated external-account/deletion-policy claims and editing residue; corrected
and rechecked with no remaining blocker. This evidence covers documents only.

2026-09-29 historical local-prototype implementation checkpoint (before P4):

- Focused suites: component lifecycle/public SDK 13; management routes/credential
  filtering 11; archive/conformance/Desktop packaging 56; ingress/authority/legacy
  renderer 8. All passed, using isolated state.
- Server/Desktop/renderer compilation and new authority/ingress test typecheck
  passed. Full test-project typecheck found missing mobile packages in this
  worktree; full CI/mobile and macOS/Linux native execution were not run.
- Two-frontends/two-services/worker fixture covers direct HTTP, cross-origin and
  wrong-owner denial, disable revocation, retained reinstall, readiness failure,
  failed/successful migration, bundled install, repeat host startup and shared
  concurrent shutdown completion.
- Ask archive `9e362b428837928457bbb6b3d0aa85e645fa344625d16d7cfe61c53c4933b6f6`
  passed Windows Electron AppRendererSurface + main-frame IPC installation,
  create, close, MCP fetch/return, reopen and actual clipboard paste. Fixture-only
  Chinese/multiline/link content; literal script text stayed inert.
- Independent reviews fixed retained-data/lifecycle, environment credential,
  close-race, native packaging and App concurrency/UI issues; final checks found
  no remaining blocker for that prototype. This is not review of P4. Stream
  interruption and the two-restart limit also passed real process tests.
  Windows x64 ngrok native loading and isolated-prefix
  Windows x64/ARM64 dependency preparation passed. External tunnel/Bot and
  non-Windows native execution remain separate acceptance.
- No release, user-profile installation, live X call or code commit/push.
  Follow the compatibility boundary in SPEC-122 before publication.
- Final mapped link check: all 441 targets in modified documents across both
  worktrees exist; both diffs pass whitespace checks.

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
