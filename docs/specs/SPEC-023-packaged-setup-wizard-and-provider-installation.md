# SPEC-023: Packaged Setup Wizard and Provider Installation

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (First Host Slice Landed) |
| **Owner** | Codex |
| **Reviewer** | User / packaging workstream |

## Summary

`cats` needs a first-run experience that feels closer to a normal desktop
product than to a developer bootstrap checklist.

The target experience is:

1. install the Cats app as a packaged product
2. open it directly without preinstalling Node.js or Python
3. complete a guided setup wizard
4. optionally install local CLI providers from inside that wizard
5. enter a ready chat experience with at least one usable provider path

The key architectural constraint is that **app installation** and
**provider installation** are different concerns.

- the Cats product itself must be runnable before any optional CLI provider is
  installed
- API-backed providers are the recommended low-friction baseline
- CLI providers are optional capability expansions that the setup wizard may
  detect, install, verify, or defer

This spec defines the user-facing setup flow and the cross-project integration
shape among `cats`, `cats-runtime`, and `environment-bootstrap`.

## Implementation Snapshot

The first host-owned slice is already in-repo:

- `cats/electron/*` now supervises local `cats-runtime` + `cats`
- readiness-gated bootstrap exists before the renderer fully enters the normal
  chat flow
- first-run setup can already distinguish setup entry versus ready entry
- the host now persists a machine-readable bootstrap/remediation snapshot for
  background helpers or later installer flows
- the host now carries a tray/background lifecycle and a manual-check
  update-channel skeleton
- packaging scripts now stage Windows/macOS/Linux build outputs plus installer
  manifests under `build/desktop-packaging`
- Windows test installs can now be exercised through a real `electron-builder`
  + `NSIS` installer path
- Windows packaged installs now also have a host-owned smoke-check script that
  verifies bundled sidecars and the persisted desktop-host bootstrap snapshot
- the bootstrap bridge now stays sandboxed, validates host-controlled actions,
  and only accepts HTTPS update manifests plus allow-listed download hosts

What remains open for the packaging workstream is the packaged-distribution and
host-operations depth around that first slice:

- signed/native installer publication
- privileged installer behavior and elevation round-trips
- richer first-run remediation polish
- auto-update download/apply policy

## Goals

- let packaged Cats builds open successfully without requiring a preinstalled
  local dev stack
- keep the first usable path as short as possible for non-technical or lightly
  technical users
- make CLI provider installation a guided optional step instead of a manual
  prerequisite
- organize provider choices as capability packs first, with per-provider detail
  only when needed
- keep long-running setup steps resumable across restarts, reboots, or first
  launches of WSL/Docker-backed tooling
- port relevant install and compatibility knowledge into shipped Cats code and
  assets without making `environment-bootstrap` a product dependency

## Non-Goals

- shipping every supported CLI provider in the first packaged release
- requiring all users to install WSL, Docker, or local models up front
- turning `cats-runtime` into the installer/process owner for provider setup
- exposing `environment-bootstrap` developer scripts directly as the product UI
- replacing the broader settings experience after first-run setup completes

## User Stories

- As a new user, I want the Cats app to open after installation without asking
  me to install developer runtimes first.
- As a new user, I want the setup wizard to recommend the fastest path to a
  usable first chat.
- As a power user, I want to opt into local CLI providers from the wizard
  without manually hunting for install commands.
- As a returning user whose setup was interrupted by a restart, Docker startup,
  or WSL user creation, I want the wizard to resume instead of starting over.

## Requirements

### Functional Requirements

1. Packaged Cats builds shall launch a first-run setup experience without
   requiring users to preinstall Node.js or Python.
2. The setup wizard shall be able to load even when no CLI provider is
   installed locally.
3. The setup wizard shall separate:
   - product bootstrap
   - provider selection
   - provider installation
   - provider verification
   - Boss Cat initialization
4. The setup wizard shall present at least one low-friction baseline provider
   path that does not require CLI installation. API-backed providers are the
   default recommended baseline.
5. CLI provider installation shall be optional and skippable.
6. The wizard shall organize provider selection primarily through capability
   packs, with advanced per-provider control available when needed.
7. The first packaged slice shall support these capability-pack directions:
   - `API Baseline (Recommended)` for API-key-backed Claude, OpenAI, and Gemini
   - `Native CLI Pack` for the most stable cross-platform native CLI providers
   - additional packs such as local-model or WSL-heavy flows may be deferred
8. The setup flow shall perform a local provider scan before offering installs
   so already-installed tools can be reused.
9. The provider scan shall report at least these states per provider:
   - `not_installed`
   - `installed`
   - `auth_required`
   - `ready`
   - `failed`
10. Completing setup shall require at least one usable provider path to be
   ready, whether API-backed or CLI-backed.
    - the flow shall not require an API provider if a CLI-backed provider path
      is already ready
11. The renderer shall not invoke shell commands or installation scripts
    directly.
12. The packaged host shall orchestrate provider install, verify, and resume
    actions and expose structured progress/results back to the renderer.
13. Provider installation may trigger UAC, sudo, relaunch, reboot, WSL
    initialization, or first-run service startup. The setup flow shall be able
    to record and resume across those interruptions.
14. The final setup result shall persist:
    - setup completion status
    - selected provider mode or capability pack choices
    - discovered/installed provider readiness state
    - Boss Cat selection and initial execution target
15. The wizard shall finish by opening the user into a ready chat entry flow.
16. The packaged host shall define explicit distribution targets for Windows,
    macOS, and Linux.
17. The packaged host shall own installer-time and first-run prerequisite
    checks for:
    - bundled app assets
    - `cats-runtime` sidecar availability
    - platform-specific provider prerequisites where relevant
18. The packaged host shall support a background/tray lifecycle that can keep
    local services alive without forcing the main window to remain open.
19. The packaged host shall define an update channel strategy, even if the
    first slice only lands manual-check or signed-manifest support.

### Cross-Project Requirements

1. `cats-runtime` shall remain the authority for provider family topology and
   provider-install metadata consumed by product hosts.
2. `environment-bootstrap` may be used as a pre-split source knowledge input,
   but the packaged Cats app shall ship product-owned install/check
   implementations or bundled assets rather than depend on the bootstrap repo
   directly.
3. The packaged host shall map runtime-owned provider install metadata onto the
   bundled execution assets it uses for actual installation and verification.
4. `cats-runtime` shall not execute provider-install scripts itself as part of
   the first packaged setup flow.
5. Product-owned install/check assets derived from internal bootstrap knowledge
   shall be invocable in a GUI-safe, non-interactive mode.
6. The packaged setup flow shall rely on structured install/check outcomes
   rather than parsing human-oriented terminal output.
7. Before `cats` and `cats-runtime` split into separate repos, any packaged
   setup helper logic still required for first-run install/check/resume flows
   shall have a `cats`-owned implementation or bundled asset baseline rather
   than a remaining dependency on monorepo-local bootstrap repos.

### Non-Functional Requirements

- the baseline setup path should minimize steps before the first usable chat
- long-running install work should surface clear progress and actionable
  failure states
- setup should be resumable and idempotent wherever practical
- platform privilege prompts should be host-managed rather than left to ad hoc
  script interactions
- the product must not require users to understand `environment-bootstrap`
  terminology, script names, or subproject boundaries

## Design Overview

```text
Packaged app install
        |
        v
  Launch Cats app
        |
        v
  First-run wizard
        |
        +--> Welcome / locale / owner basics
        +--> System scan
        +--> Choose setup mode or capability pack
        +--> API provider setup (recommended baseline)
        +--> Optional CLI provider install + verify
        +--> Boss Cat setup
        +--> Finish
        |
        v
   Ready chat entry
```

## Proposed Wizard Flow

### Step 1: Welcome

- explain that Cats can run immediately with API providers and can optionally
  add local CLI providers later
- collect minimal owner-facing settings such as display name and language

### Step 2: System Scan

- detect current OS/platform conditions
- detect already-installed providers
- detect blockers such as missing WSL distro, unavailable Docker daemon, or
  missing auth state where relevant

### Step 3: Choose Setup Mode

Recommended choices:

- `API Baseline (Recommended)`
- `API + Local CLI`
- `Local CLI Only`

Advanced view may expand to explicit capability packs or individual providers.

### Step 4: Provider Setup

#### API Baseline

- collect API keys or equivalent credentials for supported API-backed providers
- recommend this as the fastest route to a usable first chat

#### Optional CLI Provider Setup

- show already-detected providers first
- show installable providers grouped by capability pack
- run host-managed install and verification actions
- allow deferred setup for providers that are not required for the first use

### Step 5: Default Boss Cat Bootstrap

- ensure the environment has one current Boss Cat
- auto-provision a neutral default Boss Cat if needed
- choose its initial execution target from the now-ready provider options
- defer Cat naming or deeper personalization until after first entry

### Step 6: Finish

- persist setup completion
- open the normal `/new` draft surface with the current `Boss Cat` as the
  default visible entrypoint

## Packaging Follow-On Scope

The packaging workstream should cover, at minimum:

- bundling strategy for Windows/macOS/Linux
- installer output and signing assumptions
- first-run remediation contract
- tray/background host lifecycle
- update-channel contract and staged rollout assumptions

This spec does not require every one of those items to ship at once, but it
does require them to be designed as part of one host-owned packaging story.

## Post-Setup Provider Management

Completing the first-run wizard should not be the only way to manage providers.
After setup, the product should expose a provider-management entry from
Settings or an equivalent product-owned management surface so users can:

- add providers they skipped during first run
- repair or re-verify existing providers
- upgrade provider tooling through the same host-managed execution path
- revisit deferred capability packs without rerunning the entire wizard

## Capability Pack Direction

### First Packaged Slice

- `API Baseline (Recommended)`
  - Claude API
  - OpenAI API
  - Gemini API
- `Native CLI Pack`
  - Claude Code
  - Cursor Agent when already installed or available on the current platform

### Later Packs

- `Local Model Pack`
  - Ollama and local-model helpers
- `WSL / Power User Pack`
  - Kiro, Goose, Junie, and other tooling with heavier local prerequisites

## Installer and Runtime Boundary

The packaged setup flow should follow this ownership split:

- `cats` renderer
  - displays the wizard
  - renders provider choices, progress, and errors
- packaged host (future Electron main)
  - executes install/check actions
  - manages UAC/sudo/relaunch/restart flow
  - persists resumable setup state
- `cats-runtime`
  - remains the runtime/provider topology authority
  - exposes provider metadata, lightweight setup/diagnostics APIs, and runtime
    readiness
- `environment-bootstrap`
  - remains a pre-split source knowledge and experiment repo, not a shipped or
    required post-split dependency

## Knowledge Porting Direction from `environment-bootstrap`

The packaged Cats product should port or reimplement:

- provider-level install logic that has proven stable
- provider-level verification logic that has proven stable
- platform-specific edge-case handling already learned from internal bootstrap
  work
- shared knowledge about auth, PATH, shell, WSL, Docker, and encoding edge
  cases

The packaged Cats product should not depend directly on:

- `Full-Install.ps1`
- `full-install.sh`
- other developer-facing top-level bootstrap orchestration as the direct
  end-user flow

## Installer Asset Contract Direction

The bundled provider install/check assets used by the packaged host should
support a machine-readable execution contract. Those assets may be handwritten
for Cats or derived from internal bootstrap knowledge, but they should ship as
product-owned code or bundled scripts.

Preferred contract direction:

- `--check-only` for detection without installation
- `--non-interactive` as the default mode when invoked by the GUI
- structured JSON output for status, version, warnings, and actionable failure
  details
- stable outcome mapping for success, restart-required, auth-required, and
  failure cases

The goal is to let the host surface progress and recovery guidance without
teaching the renderer or the user about the underlying script topology.

## Implementation Tracking

- The first packaged-host slice is already landed in repo, including local
  service supervision, readiness-gated bootstrap, persisted bootstrap snapshot
  state, a sandboxed bootstrap bridge, and staged desktop packaging outputs.
- Dedicated follow-through for knowledge extraction from
  `environment-bootstrap`, packaged-host install/check asset contracts, and
  pre-split setup/install validation is now tracked under
  [PLAN-030](../plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md).
- The staged desktop packaging plan now also carries a machine-readable
  `installer.providerSetup` contract so packaged-host capability packs,
  knowledge-source boundaries, and prioritized Windows-first port targets are
  frozen in code instead of remaining only in prose.
- The first repo-owned packaged setup helper slice is now landed:
  `scripts/windows/Setup-NodeGlobalPrefix.ps1` rewrites the stable
  user-scoped npm prefix and PATH prerequisite logic that previously lived only
  in `environment-bootstrap`, and the staged/bundled desktop package now
  includes that helper under `shared/setup-assets/windows/` and
  `desktop-host/setup-assets/windows/`.
- The second repo-owned packaged setup helper slice is also landed:
  `scripts/windows/Install-NodeCliPack.ps1` rewrites the Windows npm-global AI
  CLI pack installer for Codex, Gemini CLI, Copilot, OpenCode, Auggie, and Pi,
  and it is staged/bundled alongside the npm prefix helper as a host-owned
  setup asset.
- The third repo-owned packaged setup helper slice is now landed:
  `scripts/windows/Check-WslPrerequisites.ps1` establishes a structured WSL
  prerequisite preflight contract so the host can detect Windows build, WSL,
  and distro readiness before the full WSL feature-enable and distro-install
  flow is ported.
- The fourth repo-owned packaged setup helper slice is now landed:
  `scripts/windows/Check-WindowsSetupReadiness.ps1` composes the repo-owned npm
  prefix, native CLI pack, and WSL prerequisite helpers into one structured
  host-side readiness audit instead of relying on the old bootstrap-wide
  `Check-Installation.ps1` report.
- The staged desktop packaging plan now also carries a machine-readable
  `installer.providerSetup.helperCatalog` so future host bridge work can bind
  setup actions to packaged assets, supported operations, and elevation
  expectations without reverse-engineering filenames.
- The next follow-on under `PLAN-030` is no longer generic WSL discovery; it
  is the repo-owned rewrite of the actual WSL prerequisite mutation chain and
  the next packaged-host helper slices so the split does not leave required
  setup logic trapped in bootstrap repos.
- Sibling collaboration/bootstrap pilot work sourced from `project-bootstrap`
  remains tracked separately through
  [cats-runtime PLAN-023](../../../cats-runtime/docs/plans/PLAN-023-a2a-layering-and-collaboration-artifact-alignment.md)
  and the mirrored pilot artifacts already present in `cats/docs/a2a/` and
  `cats/skills/`.

## Resume and Interruption Handling

The setup system should treat these as normal, resumable events rather than as
terminal failures:

- app relaunch after a packaged installer finishes
- system restart or required relaunch
- first-time WSL distro initialization
- Docker daemon warm-up
- privilege elevation round-trips
- auth-required states after install succeeds

## Dependencies

- [SPEC-012](./SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [SPEC-013](./SPEC-013-provider-catalog-consumption-and-ui-seam.md)
- [ADR-003](../decisions/003-electron-host-manages-local-services.md)
- [ADR-013](../decisions/013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
- [cats-runtime ADR-009](../../../cats-runtime/docs/decisions/009-keep-cats-runtime-separately-packageable-with-app-managed-local-startup.md)
- [environment-bootstrap README](../../../environment-bootstrap/README.md)

## Open Questions

- Which provider install states should be persisted by the app host versus
  re-derived on every launch?
- Should the first packaged slice support explicit per-provider advanced
  toggles, or should it start with pack-only choices plus a hidden advanced
  panel?

## References

- [Architecture](../architecture.md)
- [Deployment](../deployment.md)
- [ROADMAP](../../ROADMAP.md)

---

*Created: 2026-03-20*
*Author: Codex*
*Last updated: 2026-03-29*

*Related Plan: [PLAN-030](../plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md)*
