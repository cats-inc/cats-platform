# 2026-03-31 Packaged Startup Terminal Popup Investigation

Date: 2026-03-31
Topic: Investigate why the packaged Windows desktop app still opened many
visible `cmd.exe` / `powershell.exe` / `wsl.exe` windows before entering
`Cats Chat`
Source:
- `electron/main.ts`
- `electron/readiness.ts`
- `electron/processSupervisor.ts`
- `electron/persistedSetupState.ts`
- `tests/desktop-readiness.test.js`
- `tests/desktop-supervisor.test.js`
- `tests/persisted-setup-state.test.js`
- `tmp-cats-process-watch.log`
- `tmp-cats-process-watch-new.log`
- Local installed-app diagnostics under:
  - `%APPDATA%\Cats\desktop-host\state.json`
  - `%APPDATA%\Cats\desktop-host\logs\cats-runtime.log`
  - `%APPDATA%\Cats\config\chat-state.local.json`
  - `%APPDATA%\Cats\config\suite-onboarding-history.json`

## Problem Statement

After packaged setup and onboarding had already completed, closing the desktop
app and reopening it still produced many visible terminal windows before the UI
finally entered `Cats Chat`.

This was not a single missing `windowsHide: true` case. The host was still
performing startup work that spawned CLI probes and setup-audit helpers even
after onboarding had already succeeded.

## Validation Setup

Commands and checks used during the investigation:

```powershell
cd cats-platform
npm run build:host
node --test tests/persisted-setup-state.test.js tests/desktop-readiness.test.js tests/desktop-setup-bridge.test.js tests/desktop-supervisor.test.js
npm run desktop:package:windows
```

Additional process-watch evidence was captured in:

- `tmp-cats-process-watch.log`
- `tmp-cats-process-watch-new.log`

## Findings

### Startup Was Still Doing More Than a Simple Health Check

Before the app entered `Cats Chat`, the desktop host was not just checking that
the two local services were alive.

It was also doing all of the following during startup:

- deciding whether to auto-run the packaged Windows setup readiness audit
- calling the app shell and bootstrap diagnostics endpoints
- calling `cats-runtime /diagnostics/health`
- calling `cats-runtime /diagnostics/providers`

The important detail is that `cats-runtime /diagnostics/providers` is not a
cheap read-only endpoint. It exercises provider compatibility checks that can
probe local CLIs.

### The Host Could Mis-detect Post-Onboarding State

The installed machine had these persisted product-owned files:

- `%APPDATA%\Cats\config\chat-state.local.json`
- `%APPDATA%\Cats\config\suite-onboarding-history.json`

Those files already showed setup completion, including a real
`setupCompleteAt` value plus a `setup_completed` onboarding event.

However, `%APPDATA%\Cats\desktop-host\state.json` was observed as `0 bytes`
during the failure investigation. That meant the host could lose its in-memory
bootstrap diagnostics snapshot and forget that onboarding had already finished.

As a result, startup could still choose the "run prerequisite checks again"
path even though the product had already completed setup.

### The Process Watch Proved That Provider Probes Were Still Happening

The first process watch captured a startup sequence that included all of these
commands:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ...\Check-WindowsSetupReadiness.ps1 -CheckOnly -Json`
- `Install-NodeCliPack.ps1 -CheckOnly -Json`
- `copilot.cmd --version`
- `pi.cmd --version`
- `pi.cmd --help`
- `auggie.cmd --version`
- `auggie.cmd --help`
- `junie.bat --version`
- `junie.bat --help`
- `codex.cmd --version`
- `codex.cmd --help`
- `wsl --list --running --quiet`

This showed that the visible terminal storm was a combination of:

- packaged setup audit helpers
- runtime provider compatibility probes
- runtime background WSL discovery

### The Remaining WSL Popup Was Not NSIS

After earlier popup reductions, the remaining process watch only showed:

- `wsl --list --running --quiet`

Its parent process was the app-managed runtime sidecar launched as:

- `...\\resources\\cats-runtime\\dist\\index.js --startup-mode=app-managed --managed-by=cats-electron --ready-output=json`

That proved the remaining terminal was not the NSIS installer and not the
Windows setup-audit helper chain. It was the `cats-runtime` background WSL
discovery path, running during normal app-managed desktop startup.

## Root Cause

There were three cooperating causes:

1. The desktop host still treated provider diagnostics as part of the startup
   gate before entering chat.
2. The host could lose post-onboarding truth if `desktop-host/state.json`
   became empty or unusable, because it was not directly consulting the product
   persistence files.
3. The app-managed runtime still allowed background WSL and Docker discovery on
   startup.

That combination meant reopening the app could trigger:

- setup readiness audits
- provider CLI `--version` / `--help` probes
- WSL discovery

all before the user simply reached `Cats Chat`.

## Chosen Fix

### 1. Read Product-Owned Persisted Setup Completion Directly

`electron/persistedSetupState.ts` now derives post-onboarding truth directly
from:

- `chat-state.local.json`
- `suite-onboarding-history.json`

This avoids trusting `desktop-host/state.json` as the only source of truth for
"has setup already completed?".

### 2. Skip Startup Provider Reprobe After Setup Completion

`electron/main.ts` now reads the persisted setup completion state before
refreshing the bootstrap snapshot.

If setup is already complete, startup no longer calls:

- `cats-runtime /diagnostics/providers`

and no longer needs the heavy provider reprobe just to open `Cats Chat`.

### 3. Downgrade the Startup Runtime Check to `/health`

After setup completion, the desktop host uses:

- `cats-runtime /health`

instead of:

- `cats-runtime /diagnostics/health`

for the startup readiness pass.

This keeps startup focused on "is the runtime alive and ready?" rather than
"re-probe every provider compatibility path right now".

### 4. Treat Provider Diagnostics as Required Only Before Setup Is Finished

`electron/readiness.ts` now distinguishes between:

- pre-setup startup, where provider diagnostics still matter
- post-setup startup, where a successful app health check plus runtime health
  is enough to enter chat

That lets the host open `Cats Chat` without blocking on a startup provider
diagnostic reprobe.

### 5. Disable Background WSL and Docker Discovery for App-Managed Desktop Runtime

`electron/processSupervisor.ts` now launches the app-managed runtime with:

- `CATS_RUNTIME_WSL_DISCOVERY_POLICY=manual_only`
- `CATS_RUNTIME_DOCKER_DISCOVERY_POLICY=manual_only`

This removes the remaining `wsl --list --running --quiet` startup activity from
the desktop host path.

## Landed Code Changes

- `electron/persistedSetupState.ts`
  - new persisted setup completion reader
- `electron/main.ts`
  - reads persisted setup completion before startup gating
  - skips startup `/diagnostics/providers` after setup completion
  - uses runtime `/health` instead of the heavier diagnostics route on the
    post-setup path
- `electron/readiness.ts`
  - supports persisted setup completion in the bootstrap snapshot builder
  - only requires provider diagnostics before setup is complete
- `electron/processSupervisor.ts`
  - forces app-managed runtime WSL/Docker discovery into `manual_only`
- `tests/persisted-setup-state.test.js`
  - regression coverage for persisted setup completion detection
- `tests/desktop-readiness.test.js`
  - regression coverage for the "open chat without startup provider reprobe"
    path
- `tests/desktop-supervisor.test.js`
  - regression coverage for `manual_only` discovery policies on the
    app-managed runtime

## Validation Result

After applying the fix and packaging a fresh local Windows build:

- `npm run build:host` passed
- the targeted regression test suite passed
- `npm run desktop:package:windows` succeeded
- launching the new `release/win-unpacked/Cats.exe` under process watch for
  22 seconds produced:

```text
NO_NEW_CMD_PWSH_WSL
```

That validation means the packaged startup path no longer opened new visible
`cmd.exe`, `powershell.exe`, `pwsh.exe`, or `wsl.exe` windows during the
observed post-onboarding reopen case.

## Tradeoffs

- Post-onboarding startup no longer re-probes provider compatibility on every
  launch. That is intentional.
- Provider compatibility and deeper diagnostics still belong to explicit setup
  and diagnostics flows, not the steady-state "open the app and enter chat"
  path.
- WSL and Docker discovery remain available later through explicit runtime or
  setup flows; they are simply no longer part of background startup for the
  app-managed desktop runtime.

## Relevance

This note captures the operational know-how behind a user-visible packaging
failure mode that was easy to misdiagnose as "just another missing
`windowsHide`".

The actual lesson is:

- hide flags matter
- but the bigger requirement is to keep steady-state desktop startup narrow
- post-onboarding startup should use persisted product truth plus lightweight
  health checks, not reopen the entire packaged setup and provider-probe stack

## Action Items

- Keep post-onboarding startup limited to lightweight health checks unless a
  future ADR explicitly widens that contract.
- Treat product-owned persistence files as the source of truth for setup
  completion when the host diagnostic snapshot is missing or corrupt.
- Keep runtime discovery policies explicit for the app-managed desktop runtime
  so background probes do not silently reappear in startup.

## Idle Popup Follow-Through

The startup fixes above were necessary but not sufficient. A later investigation
showed that packaged `Cats` could still open visible terminals while the app was
already sitting idle in the chat product.

### What was actually happening

- The packaged host was no longer polling the heavy startup diagnostics path.
- The remaining visible windows came from the app-managed `cats-runtime`
  process itself.
- A live process watch captured a new child process with this parent chain:
  - `Cats.exe` (desktop host)
  - `Cats.exe ... resources\\cats-runtime\\dist\\index.js`
  - `powershell.exe -NoLogo -NoProfile -Command ... CATS_RUNTIME_PWSH_EXEC_B64`
- The same runtime log also continued to show repeated external-session
  discovery activity after chat was already open, especially for file-backed
  and native session import flows.

### Root cause

`cats-runtime` still runs background native discovery timers in
`src/server.ts` for these provider families:

- `cursor`
- `kiro`
- `opencode`
- `kilo`
- `goose`

Those timers are controlled by `nativeDiscoveryIntervalMs`, which defaults to
5 seconds. Even after the packaged host stopped calling
`/diagnostics/providers`, the runtime would still wake up on its own and run
native provider discovery work in the background. On Windows, those scans go
through the runtime PowerShell wrapper used for native command execution, which
was enough to surface transient visible terminals on the desktop.

### Landed follow-through

The packaged desktop host now launches the app-managed runtime with:

- `CATS_RUNTIME_WSL_DISCOVERY_POLICY=manual_only`
- `CATS_RUNTIME_DOCKER_DISCOVERY_POLICY=manual_only`
- `CATS_RUNTIME_NATIVE_DISCOVERY_INTERVAL_MS=0`

That combination means:

- no background WSL discovery
- no background Docker discovery
- no background native session discovery timer at all

Explicit setup and diagnostics flows can still trigger discovery when the user
asks for it, but the steady-state packaged desktop runtime no longer self-starts
those background scans while the app is idle.
