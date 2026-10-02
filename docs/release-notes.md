# Release Notes

> Operator-facing behavior changes and migration notes for Cats Platform.

## 2026-10-03 — Desktop 0.7.7 standard preview

Desktop **0.7.7** is the owner-requested standard-profile preview. Windows and Linux
show Catlas's colour face without the navy tile everywhere the app icon appears,
and Reset Platform data also returns the window to its default placement. This is
a compatible patch with no public API, configuration or stored-format change to
existing data and no migration.

- **Windows and Linux app icons.** Catlas's colour face on a transparent background,
  cropped to fill the icon, replaces the navy tile for `Cats.exe` and its desktop
  and Start-menu shortcuts, the NSIS installer, uninstaller and installer-header
  icons, the Linux desktop icons and the window icon.
  - The taskbar button follows the Start-menu shortcut through the app's
    AppUserModelID, so it now shows the face too. In 0.7.6 only the title bar did,
    and the taskbar button kept the tile.
  - The cream whiskers are faint on light backgrounds such as Windows 11's default
    light taskbar.
  - Windows can keep showing an existing shortcut's old icon until its icon cache
    refreshes.
  - The macOS app icon keeps the navy tile, and the tray and menu-bar icons on every
    platform are unchanged from 0.7.6.
- **Reset Platform data.** Besides erasing the data, reset deletes
  `<CATS_DESKTOP_DIR>/window-state.json` and moves the main window back to the
  default placement (85% of the primary work area, between 1280×800 and 1680×1050,
  maximized when that does not fit) before the setup page loads. It leaves full
  screen first. Restoring the window is best effort: if it fails, the reset is
  still reported as successful. The en and zh-TW reset descriptions say so.
- **Runtime.** Keep the 0.7.6 pin, `8729cd6cb17ab52a034e2365baffcd82915a8af8`
  (package version 0.4.0), on every OS and in the complete source archive.
- **Apps.** Reuse Usage 0.5.1, SHA-256
  `8189edbf1cce81ce4d712a0cf59f9d8ab4e23225add1cbb7e3b06030483ad467`.
  Its host/SDK requirements and the knowledge bundles' `0.7.x` ranges remain
  compatible. No App, Runtime npm, Platform npm or cats-one publication is selected.
- **Signing and updates.**
  - The manual `desktop-release.yml` dispatch uses `tag=v0.7.7`, the full Runtime
    SHA above and `unsigned=false`; the workflow creates the preview tag.
  - Expected trust profile: macOS signed + notarized, Windows unsigned (no
    certificate), Linux n/a.
  - Standard-profile 0.7.6 installs keep their update path: macOS uses the same
    Developer ID team, Windows stays unsigned to unsigned, and Linux uses the
    `.deb` update path. No installed upgrade is exercised.
- **Validation.**
  - Both changes ran full PR CI.
  - For the icons, the icon generator and Desktop packaging tests also ran locally,
    and the icons were checked in rendered previews only, not on a Windows or Linux
    desktop.
  - The window reset was not exercised live, because that erases real Platform data.
  - No packaged installer with these changes was checked on a desktop before the
    dispatch.
  - Publication results: the [`v0.7.7` GitHub Release](https://github.com/cats-inc/cats-platform/releases/tag/v0.7.7)
    and its workflow run.

## 2026-10-03 — Desktop 0.7.6 standard preview

Desktop **0.7.6** is the owner-requested standard-profile preview. A direct-message
draft with a cover keeps its composer level with the Catlas pill, the macOS menu-bar
icon gains Catlas's mouth, and Windows and Linux get their own tray and window
icons. This is a compatible patch with no public API, configuration or
stored-format change to existing data and no migration.

- **Direct-message draft with a cover.** The cover stays at the top of the draft,
  and the large avatar, the name and **View cat profile** sit directly above the
  composer, whose center stays at half the window height, level with the Catlas
  pill. In a short window the avatar first overlaps the cover's bottom edge, by at
  most 32px (40px when narrow), before it pushes the composer down. Other draft
  headers keep the stacked cover.
- **macOS menu-bar icon.** Catlas's mouth is cut out next to the eyes, so it shows
  the menu-bar colour like they do.
- **Windows and Linux tray icon.** Still the navy tile, now with the menu-bar
  silhouette in white on it: the head, thicker white whiskers, and the eyes and
  mouth cut out to the tile.
- **Windows and Linux window icon.** The title bar, and the taskbar button of an
  unpinned running window, show Catlas's colour face on a transparent background,
  cropped to fill the icon. Its cream whiskers are faint on a light title bar.
  Pinned taskbar and Start-menu entries use the app icon, and the app icons on
  every platform are unchanged from 0.7.5.
- **Runtime.** Keep the 0.7.5 pin, `8729cd6cb17ab52a034e2365baffcd82915a8af8`
  (package version 0.4.0), on every OS and in the complete source archive.
- **Apps.** Reuse Usage 0.5.1, SHA-256
  `8189edbf1cce81ce4d712a0cf59f9d8ab4e23225add1cbb7e3b06030483ad467`.
  Its host/SDK requirements and the knowledge bundles' `0.7.x` ranges remain
  compatible. No App, Runtime npm, Platform npm or cats-one publication is selected.
- **Signing and updates.**
  - The manual `desktop-release.yml` dispatch uses `tag=v0.7.6`, the full Runtime
    SHA above and `unsigned=false`; the workflow creates the preview tag.
  - Expected trust profile: macOS signed + notarized, Windows unsigned (no
    certificate), Linux n/a.
  - Standard-profile 0.7.5 installs keep their update path: macOS uses the same
    Developer ID team, Windows stays unsigned to unsigned, and Linux uses the
    `.deb` update path. No installed upgrade is exercised.
- **Validation.**
  - Both changes ran their own full PR CI.
  - The draft layout was previewed in an installed Desktop 0.7.5 renderer over CDP
    with the CSS injected.
  - For the icons, the icon generator and Desktop packaging tests ran locally, and
    the icons were checked in rendered previews only, not on a Windows or Linux
    desktop.
  - No packaged installer with these changes was checked on a desktop before the
    dispatch.
  - Publication results: the [`v0.7.6` GitHub Release](https://github.com/cats-inc/cats-platform/releases/tag/v0.7.6)
    and its workflow run.

## 2026-10-02 — Desktop 0.7.5 standard preview

Desktop **0.7.5** is the owner-requested standard-profile preview. The window now
sizes itself from the screen and reopens where you left it, an open Artifact Canvas
gets more room, and the Catlas pill and macOS menu-bar icon read better. This is a
compatible patch with no public API, configuration or stored-format change to
existing data and no migration.

- **Window size and placement.**
  - The main window reopens with its last normal size, position and maximized
    state. These are saved in `<CATS_DESKTOP_DIR>/window-state.json` (version 1),
    a new file; without it, or when the saved display is gone, the default applies.
  - The default is 85% of the primary screen's work area, centered, between
    1280×800 and 1680×1050. Screens below 1280×800 open maximized.
  - The smallest drag size drops from 960×700 to 960×600.
- **Artifact Canvas.** Opening a canvas collapses an expanded product sidebar to its
  rail, and closing it expands the sidebar again. The saved sidebar preference is
  not changed, and a sidebar you collapsed yourself stays collapsed.
- **New-chat composer.** A new chat's composer sits at half the window height, level
  with the floating Catlas pill. The +Group toolbar is back to 28px high.
- **Catlas pill.** The avatar fills its round pill instead of showing as a narrow
  navy bar, and the face is slightly larger.
- **macOS menu-bar icon.** The template is 20pt (40px @2x) instead of 16pt and
  follows Catlas's head, eyes and whiskers, with thicker whiskers. The Windows and
  Linux tray icons and the app icons on every platform are unchanged from 0.7.4.
- **Runtime.** Keep the 0.7.4 pin, `8729cd6cb17ab52a034e2365baffcd82915a8af8`
  (package version 0.4.0), on every OS and in the complete source archive.
- **Apps.** Reuse Usage 0.5.1, SHA-256
  `8189edbf1cce81ce4d712a0cf59f9d8ab4e23225add1cbb7e3b06030483ad467`.
  Its host/SDK requirements and the knowledge bundles' `0.7.x` ranges remain
  compatible. No App, Runtime npm, Platform npm or cats-one publication is selected.
- **Signing and updates.**
  - The manual `desktop-release.yml` dispatch uses `tag=v0.7.5`, the full Runtime
    SHA above and `unsigned=false`; the workflow creates the preview tag.
  - Expected trust profile: macOS signed + notarized, Windows unsigned (no
    certificate), Linux n/a.
  - Standard-profile 0.7.4 installs keep their update path: macOS uses the same
    Developer ID team, Windows stays unsigned to unsigned, and Linux uses the
    `.deb` update path. No installed upgrade is exercised.
- **Validation.**
  - Window placement, the canvas sidebar and the composer changes ran their own
    full PR CI.
  - For the icons and the Catlas pill, the icon generator, Desktop packaging and
    Catlas sidecar tests ran locally, and the pill fix was previewed in an
    installed Desktop renderer over CDP.
  - No packaged installer with these changes was checked on a desktop before the
    dispatch.
  - Publication results: the [`v0.7.5` GitHub Release](https://github.com/cats-inc/cats-platform/releases/tag/v0.7.5)
    and its workflow run.

## 2026-10-01 — Desktop 0.7.4 standard preview

Desktop **0.7.4** is the owner-requested standard-profile preview. When a catalog
update removes a saved model, option value (such as an effort) or mode, Cats marks
it and leaves the choice to the user instead of quietly substituting one. Choices
that are still offered keep starting automatically, as in 0.7.3. This is a
compatible patch with no public API, configuration or stored-format change and no
migration; the marks are derived from the current catalog when shown.

- **Default chats.** The composer chip keeps the saved label and shows a red mark
  that says what is gone. Clicking it opens the model panel. That panel lists the
  removed choice as "no longer offered" and saves only when you pick.
- **Cats and Catlas.**
  - A red mark appears at the bottom-left of the cat's avatar in the sidebar, the
    Settings cat list and the chat header, and on Catlas's pill.
  - Clicking a marked avatar opens that cat's model field in Settings (Catlas:
    Settings > Assistants).
  - Picking a model there also fixes the cat's chats that ran the gone choice.
    When the cat's own choice is still offered, opening it from the mark fixes
    those chats with it. Chats that chose another model keep it.
- **Failed starts.** When a chat cannot start because its saved choice is gone, the
  message names the missing choice and no longer shows the internal rejection
  prefix.
- **Pickers and reconciliation.** Settings, side panels and Code relay pickers no
  longer turn a removed model into a custom model string or replace a removed option
  without asking.
- **Not covered.** Group-chat composer chips and assistant presets show no mark yet.
  See [SPEC-013](specs/SPEC-013-provider-catalog-consumption-and-ui-seam.md) for
  these and the other known limits.
- **Runtime.** Keep the 0.7.3 pin, `8729cd6cb17ab52a034e2365baffcd82915a8af8`
  (package version 0.4.0), on every OS and in the complete source archive.
- **Apps.** Reuse Usage 0.5.1, SHA-256
  `8189edbf1cce81ce4d712a0cf59f9d8ab4e23225add1cbb7e3b06030483ad467`.
  Its host/SDK requirements and the knowledge bundles' `0.7.x` ranges remain
  compatible. No App, Runtime npm, Platform npm or cats-one publication is selected.
- **Signing and updates.**
  - The manual `desktop-release.yml` dispatch uses `tag=v0.7.4`, the full Runtime
    SHA above and `unsigned=false`; the workflow creates the preview tag.
  - Trust profile: macOS signed + notarized, Windows unsigned (no certificate),
    Linux n/a.
  - Standard-profile 0.7.3 installs keep their update path: macOS uses the same
    Developer ID team, Windows stays unsigned to unsigned, and Linux uses the
    `.deb` update path. No installed upgrade is exercised.
- **Validation.**
  - The full local Node suite ran because the change spans shared contracts and
    many surfaces. Failures needed only the desktop host build, plus two
    environment cases on this Windows machine: Unix scripts resolving `bash` to WSL
    and a `tar` drive-letter path.
  - Also run: the four TypeScript projects (the mobile one lacked dependencies),
    the catalog boundary, docs-boundary and test-collection checks, and a check
    that every choice in the frozen catalog fixture classifies as current.
  - No live Desktop screen check was made.
  - Publication results: the [`v0.7.4` GitHub Release](https://github.com/cats-inc/cats-platform/releases/tag/v0.7.4)
    and its workflow run.

## 2026-10-01 — Desktop 0.7.3 standard preview

Desktop **0.7.3** is the owner-requested standard-profile preview. It fixes saved model selections that Desktop 0.7.2's refreshed Runtime catalog
rejected. Chats, cats and Catlas failed to start with `Catalog changed; choose the
model again from the current catalog.` Saved selections record the catalog revision
they were chosen under, so 0.7.2's "no persisted-data contract change" did not hold
for them, even when the saved model and effort were unchanged. This is a compatible
patch with no public API, configuration or stored-format change and no migration.
A re-stamped selection is written back when its chat's next session starts.

- **Saved selections.**
  - A saved selection whose model, option values and preset are still offered now
    starts under the current catalog with no user action. This covers chats, cats,
    Code relay, Work collaboration and Catlas.
  - Only a removed model, option value or preset still fails. The message now names
    the missing choice.
  - A catalog update no longer closes and restarts a live chat session.
  - A new chat's saved default whose model was removed starts from the provider's
    default model and options.
  - Attention marks for existing conversations, cats and Catlas are planned
    separately ([SPEC-013 follow-up](specs/SPEC-013-provider-catalog-consumption-and-ui-seam.md#follow-up-saved-selections-after-a-catalog-update-2026-10-01)).
- **Runtime.** Keep 0.7.2's pin, `8729cd6cb17ab52a034e2365baffcd82915a8af8` (package
  version 0.4.0), on every OS and in the complete source archive. Runtime's later
  main commit changes only documentation.
- **Apps.** Reuse Usage 0.5.1, SHA-256
  `8189edbf1cce81ce4d712a0cf59f9d8ab4e23225add1cbb7e3b06030483ad467`.
  Its host/SDK requirements and the knowledge bundles' `0.7.x` ranges remain
  compatible. No App, Runtime npm, Platform npm or cats-one publication is selected.
- **Signing and updates.**
  - The manual `desktop-release.yml` dispatch uses `tag=v0.7.3`, the full Runtime SHA
    above and `unsigned=false`; the workflow creates the preview tag.
  - Trust profile: macOS signed + notarized, Windows unsigned (no certificate),
    Linux n/a.
  - Standard-profile 0.7.2 installs keep their update path: macOS uses the same
    Developer ID team, Windows stays unsigned to unsigned, and Linux uses the `.deb`
    update path. No installed upgrade is exercised.
- **Validation.**
  - Local checks before merge:
    - 120 focused Node tests: client recovery, selection classification and routing;
    - 98 bundled reconcile and picker tests;
    - the server, desktop, renderer and test TypeScript projects;
    - the catalog boundary, test-collection and docs-boundary checks.
  - Not run locally: the mobile typecheck, because the worktree had no mobile
    dependencies. Full PR CI and the Desktop workflow gates cover the rest.
  - Publication results: the [`v0.7.3` GitHub Release](https://github.com/cats-inc/cats-platform/releases/tag/v0.7.3)
    and its [workflow run](https://github.com/cats-inc/cats-platform/actions/runs/36800526570).

## 2026-10-01 — Desktop 0.7.2 standard preview (published)

Desktop **0.7.2** was published on 2026-10-01 (Taipei) as the owner-requested
[standard-profile preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.7.2)
from `4fa55d9781950fc87c10d97a12367f1b0c13cc41` ([preparation PR #226](https://github.com/cats-inc/cats-platform/pull/226)).
The Platform source differs from Desktop 0.7.1 only by release documentation and
the shared manifest/lockfile version. This is a compatible patch with no public
API, configuration or persisted-data contract change and no migration.

- **Runtime.** Pin `8729cd6cb17ab52a034e2365baffcd82915a8af8` (package version
  remains 0.4.0) on every OS and in the complete source archive. Since 0.7.1's
  `6dd398f9`, the Claude CLI catalog adds Sonnet 5.5 and the Codex CLI catalog adds
  GPT-6.1-Sol as its model default, with Low reasoning. All previous model IDs
  remain available; existing session bindings retain their recorded arguments.
  Claude's `sonnet` alias now follows Sonnet 5.5, with Sonnet 5 kept as an explicit
  model ID. Ultracode moves out of the upstream effort picker into a separate
  toggle, so the catalog no longer offers it as an effort; the CLI still accepts
  the old argument as a legacy alias of xhigh. Picker observations and validation
  are recorded in Runtime.
- **Apps.** Reuse Usage 0.5.1, SHA-256
  `8189edbf1cce81ce4d712a0cf59f9d8ab4e23225add1cbb7e3b06030483ad467`.
  Its host/SDK requirements and the knowledge bundles' `0.7.x` ranges remain
  compatible. No App, Runtime npm, Platform npm or cats-one publication is selected.
- **Signing and updates.** The manual `desktop-release.yml` dispatch used
  `tag=v0.7.2`, the full Runtime SHA above and `unsigned=false`; the workflow
  created the preview tag. Verified trust: macOS signed + notarized, Windows unsigned (no certificate),
  Linux n/a. Standard-profile 0.7.1 installs retain their update path: macOS uses
  the same Developer ID team, Windows stays unsigned to unsigned, and Linux uses
  the `.deb` update path. Installed upgrades are not exercised by this version bump.
- **Validation.** The `v0.7.2` version identity guard and all 12 release-version
  tests passed locally (Node test isolation disabled for the sandbox). Full
  [candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36789839354)
  passed 5,490 tests with 59 skipped and zero failures; the final documentation
  refinement reused that exact code fingerprint in the passing required CI.
  All eight [Desktop workflow jobs](https://github.com/cats-inc/cats-platform/actions/runs/36790847442)
  succeeded, including packaged Platform startup, offline App activation, source
  receipts and release-asset validation. The published prerelease has 14 assets.
- **Public downloads.** Every asset covered by `SHA256SUMS` matches its SHA-256
  and public size. All three update metadata files name real assets with matching
  size and SHA-512. The downloaded source ZIP passes the complete-source verifier
  for Platform `4fa55d97`, Runtime `8729cd6c`, cats-apps `1c67c428` and Usage 0.5.1.
  The Linux `.deb` carries Platform 0.7.2 and the matching source descriptor;
  its Runtime catalog has digest
  `bbfb0c764dd04457859f51bd5bc34c11e089ef5a45d2cc986e16a4f310e79f9c`, eight Codex
  CLI models and `gpt-6.1-sol` as the default.
- **Platform trust evidence.** macOS uses Developer ID team `97JBZ3MFX5`, with
  successful notarization, stapled-ticket validation and `Notarized Developer ID`
  Gatekeeper assessment. The downloaded Windows installer reports `NotSigned`,
  matching the standard profile's absent Windows certificate. Linux signing is n/a.
  No installed 0.7.1 to 0.7.2 upgrade or provider inference call was exercised.

## 2026-09-30 — Desktop 0.7.1 standard preview (published)

Desktop **0.7.1** was published on 2026-09-30 (Taipei) as a
[standard-profile preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.7.1)
from `8fc4d9dae28282e9f19534efdd30c89c6b247a86`, the source after Platform 0.7.0
(`6d53fb56`). `0.7.1 preview · standard · macOS signed + notarized / Windows unsigned (no certificate) / Linux n/a`.
The owner authorized this Desktop preview only:
Platform npm is not published at this version, so npm `latest` stays 0.7.0, and
Runtime, cats-one and Apps are not released. It is a **patch**. Every change since
0.7.0 is compatible. There are no public API, configuration or persisted-data
contract breaks, and no migration.

- **Runtime.** Desktop bundles Runtime main at `6dd398f9` (Runtime 0.4.0 plus #140,
  #142 and #143). These add:
  - `continuity.sessionMcpServers` in provider reads;
  - a message-stream heartbeat, so long silent Codex work no longer hits
    Platform's 120 s idle timeout;
  - session MCP delivery for GitHub Copilot CLI.
  Runtime npm is not published.
- **Code previews** (PLAN-116). Cats can start a project's dev server with
  `start_dev_preview`: Vite directly, or other scripts through npm with framework
  port adapters.
  - This needs Settings > Code "Cats may run preview servers", which is **off by
    default** (opt-in), and a session that can already run shell commands.
  - The canvas gains a controls row for dev servers: status, Stop, Restart, Logs
    and Open in browser.
  - A static preview whose lease was lost, for example after a Platform restart,
    restarts on the same artifact.
  - A conversation's previews stop when its sessions end, and the next start
    cleans up dev servers a crash left behind.
  - Markdown files open in a sanitized viewer.
  - Code/Markdown files served by a preview lease now load in the canvas.
- **Apps** (PLAN-115 P1). Stopping an App component ends the processes it
  started. Components run as their own process group on POSIX, detached Windows
  remnants are cleaned up, and the next start sweeps trees a crash left behind.
- **Session MCP** (PLAN-116 F5). App and plugin servers can join a Cat session
  through one composition point. No consumer uses it yet.
- **New stored state:**
  - the preference `codePreviewServersEnabled`; an absent value reads as off;
  - `state/code-live-preview-processes.json`;
  - `apps/component-processes.json`.
  0.7.0 ignores all three, so moving back needs no conversion.
- **Unchanged:** the Usage 0.5.1 App pin, and the knowledge bundles'
  `platformRange: "0.7.x"`.
- **Publication evidence.**
  - All eight [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36675594193)
    jobs passed, and the prerelease has 14 assets.
  - `SHA256SUMS` verifies every downloaded asset. The three update metadata
    files name the uploaded files with matching sizes, and the Windows installer
    and Linux package match their updater SHA-512.
  - `Cats-v0.7.1-sources.json` records Platform `8fc4d9da`, Runtime `6dd398f9`,
    cats-apps `1c67c428` and Usage 0.5.1 (SHA-256 `8189edbf…`).
  - The Linux package carries Platform 0.7.1, with the dev-preview tools and the
    shared process-tree module. It also carries Runtime at `6dd398f9` (package
    version still 0.4.0), with the stream heartbeat and Copilot session MCP
    delivery.
  - The macOS log shows the Developer ID Application signature (team
    `97JBZ3MFX5`), successful notarization and a `Notarized Developer ID`
    Gatekeeper assessment. The Windows installer is unsigned, because no
    certificate is configured.
  - Standard-profile 0.7.0 installs should self-update on every OS: macOS stays
    signed with the same team, Windows unsigned to unsigned, and Linux verifies
    no signature.
  - No provider calls were made.
- **Not verified here.** An installed 0.7.0 → 0.7.1 upgrade on each OS. The Code
  preview acceptance (PLAN-116 M2/M3) ran in isolated instances on Windows, and
  the App process-tree tests ran on Windows locally and on Linux in CI.
- **Merged PRs:**
  - features: #213, #216, #217, #218, #220 and #224;
  - release fix: #214;
  - documentation: #219 and #221–#223.

## 2026-09-30 — Platform 0.7.0 npm and Desktop standard preview (published)

Platform **0.7.0** was published to npm `latest` and as the Desktop 0.7.0
standard-profile preview on 2026-09-30 (Taipei); the owner authorized both together with Runtime 0.4.0,
Usage 0.5.1, Studio 0.2.1 and cats-one 0.4.0. It is a **minor** for two reasons:
Desktop bundles Runtime **0.4.0**, itself a minor because an API key no longer
implies binding every interface (Desktop is unaffected: the supervisor passes
`CATS_RUNTIME_HOST=127.0.0.1` explicitly), and main since 0.6.1 carries new
features, listed below, not only fixes. No persisted-data format changes or
migrations landed since 0.6.1; the only store change is a write-path fix (#193).

- **Bundled App selection.** Desktop pins Usage **0.5.1** (SHA-256
  `8189edbf1cce81ce4d712a0cf59f9d8ab4e23225add1cbb7e3b06030483ad467`), whose only
  change from 0.5.0 is the corrected publisher metadata. Studio 0.2.1 is published
  but stays outside the default bundle. Both declare `catsPlatform ^0.6.0`, which
  this host reads as a floor (ADR-128 below).
- **Bundled knowledge.** The Orchestrator and code-entry knowledge bundles move to
  `platformRange: "0.7.x"` as revision `2026-09-30.1`; their entries are unchanged. The
  loaders and Desktop staging reject a bundle whose range excludes the running Platform,
  so this is part of every Platform minor.
- **Excluded from this source.** The new Ask App (0.1.0) is not released. Platform
  [#211](https://github.com/cats-inc/cats-platform/pull/211) (Telegram: a Cat's own bot
  answers without a room note) merged before this version was finalized and is included.
- **Not verified here.** An installed 0.6.1 → 0.7.0 upgrade on each OS; only the
  hosted release gates and the packaged-startup check run for this preparation.
- **Also in this release** (merged PRs): companion Cats keep a daily rhythm, speak
  first when awake and send photos from their album (#186, #187, #189, #206), the
  owner's Telegram photos reach the Cat and the companion answers like it is on duty
  (#188, #208), the Artifact Canvas beside the Code conversation with static previews
  from supervisor-leased loopback origins, `show_in_canvas`, the Cats Code MCP
  endpoint and server, and the reopen-latest-preview control (#191, #195, #196, #198,
  #203, #207), session MCP servers carried through the runtime client (#190),
  complete Apps hosted behind shared Platform ingress (#194), @mentions of Cat names
  containing a space (#204), and the chat store no longer writing from an unlocked
  read (#193).

### Session deletion warnings

- Conversation deletion now asks for confirmation before calling Runtime. The
  destructive button says **Delete permanently**. English and Traditional Chinese
  dialogs explain that linked Runtime data and provider-side native transcripts
  are permanently erased without a backup or recovery, naming known CLI providers.
  Providers without native transcripts get the generic Runtime-data warning.
- Direct-lane Clear, parallel-chat deletion and Cat deletion include the same
  warning. Active lease providers take precedence over a Cat's current default;
  when session metadata is unavailable the warning covers any provider transcript.
- Mobile's revealed Delete action also opens a native confirmation alert before
  sending DELETE, using the same localized irreversible-transcript warning.
- Compatible with existing installs: deletion behavior and persisted formats are
  unchanged; this adds truthful confirmation. No version bump or publication.

### Distribution hygiene

- **App compatibility is decided by the App SDK version alone (ADR-128).** An App's
  `compatibility.catsPlatform` is now read as a minimum host version: the host accepts any
  Platform at or above the floor of the declared range, across minors. `compatibility.appSdk`
  remains the range the host's `APP_SDK_VERSION` must satisfy. Published Apps therefore no
  longer need a re-release when Platform bumps its minor; Usage 0.5.0 and Studio 0.2.0
  (declared `^0.6.0`) stay installable on 0.7 and later. The change is strictly more
  permissive; every previously accepted App is still accepted. Platform changes visible
  to Apps must move `APP_SDK_VERSION` from now on.
- **Renderer dependency notices ship with npm and Desktop.** Vite records the
  packages actually included in both renderer entries (including extracted CSS),
  preserves their original license and notice texts beside the renderer output,
  and hashes the resulting notice and all output files. Missing upstream license
  text fails the build; missing, changed or unlisted renderer resources fail
  Desktop staging before replacing an existing stage and fail the installed-resource
  gate. Existing installs and persisted data are unchanged; the next build adds
  these files without a new compatibility boundary. No version bump or release
  is part of this change.
- **Reset Platform data removes the data it promises.** Reset now removes rotating
  and migration backups, canonical and companion memory, local knowledge, evidence
  logs, Telegram/LINE and work-delivery state, schedules, Platform-owned attachments
  and runtime-history caches from an explicit ownership list. It clears live store
  caches and polling bindings, closes authenticated event streams, pauses background
  producers, and refuses to reset during active work. A bounded reset journal retains
  attachment/evidence cleanup targets across interrupted erasure and restart.
  The shared local/public ingress guard also revokes Code MCP grants, stops Code
  previews and clears their leases/logs and pending canvas intents. Failed preview
  cleanup remains retryable instead of silently forgetting a running server.
  Missing files are harmless; cleanup failures are reported for retry rather than
  reported as success. Both UI locales list what remains: host preferences/configuration,
  installed Apps/plugins and their data, Desktop/Runtime data, provider CLI logins
  and native transcripts, and external workspace files. The button is now labelled
  **Erase Platform data** to make that boundary clear.
  For existing installs this fixes incomplete erasure after an explicit reset;
  ordinary startup and persisted formats do not change. No migration, version bump
  or publication is included. Fresh empty stores may be created by subsequent use.
- **New app icon.** The Desktop icon is now a front-facing orange tabby on a deep-navy
  rounded tile, replacing the light-on-dark cat silhouette in a circle. It applies to the
  Windows installer and taskbar, the macOS Dock (`.icns` now follows Apple's icon grid
  inset), Linux desktop entries, the colour tray icon, the macOS menu-bar template (a
  silhouette with whiskers and knocked-out eyes, generated from its own SVG), the
  renderer favicon and the Catlas guide-cat avatar. Existing installs pick it up with the
  next update; no data or settings change.
- **.NET runtime notices ship with the Windows voice helper.** Packaging now copies the
  self-contained .NET runtime pack's `LICENSE.TXT` and `THIRD-PARTY-NOTICES.TXT`, resolved
  from the exact version in the published `deps.json`, into `native/windows-stt/licenses/`
  together with an index naming the Windows SDK .NET projection assemblies and their
  license terms. Staging fails when the NuGet runtime pack texts are missing, and the
  installed-resource gate verifies them whenever the helper binary is present. The Vite
  renderer bundle notices are now covered by the separate renderer gate above.
- **README states provider responsibility and data handling.** The README now says that
  each provider's terms govern what a user's plan allows, and describes where Platform and
  Desktop state live, what leaves the machine, and that deletions are permanent.
- Documentation and test fixtures no longer carry the maintainer's private machine
  addresses, home paths or unpublished project names. No behavior change.
- **Release assets carry checksums and build provenance.** The Desktop release
  workflow now uploads `SHA256SUMS` covering every asset and records a Sigstore
  build-provenance attestation for each file, verifiable with
  `gh attestation verify <file> --repo cats-inc/cats-platform`. This covers the
  unsigned Windows installer and the Linux `.deb` as well as the signed macOS
  builds. Installed apps and the updater are unchanged.

- **Release plan.** The owner authorized Platform npm 0.7.0 (`latest`) and a Desktop 0.7.0
  standard preview (`unsigned=false`) together with Runtime 0.4.0, Usage 0.5.1, Studio 0.2.1
  and cats-one 0.4.0. Both Platform releases were first dispatched from a temporary
  `release/0.7.0` branch at `6d53fb568988c1884cf37abb3eb030a0bcea7f8c`; the Desktop
  run was repeated from `main` at `2c637d54df014fd64f9a5be781e8d06640e059b3`, which
  differs only by the workflow fix below, so the packaged sources are the same. The
  branch was deleted afterwards and tag `v0.7.0` keeps the commit.

npm **0.7.0** was published to `latest` from `6d53fb56`. The
[npm publish workflow](https://github.com/cats-inc/cats-platform/actions/runs/36612412794)
test gate passed 5,446 of 5,505 tests with 59 skipped and no failures; the tarball has
3,816 files and a Sigstore provenance statement
([transparency log 3004093939](https://search.sigstore.dev/?logIndex=3004093939)). The
registry document lagged the successful publish by several minutes; no repeat
publication was made. cats-one 0.4.0 (`^0.7.0`, Runtime `^0.4.0`) followed: a fresh-cache
`npx --yes cats-one@latest --platform-only --help` resolved cats-one 0.4.0, Platform 0.7.0
and Runtime 0.4.0.

The first Desktop run
([36612417820](https://github.com/cats-inc/cats-platform/actions/runs/36612417820)) built,
validated and drafted every asset, then failed in the new publish job: the `SHA256SUMS`
redirection created the file before `find` listed the directory, so the list hashed its
own empty file and the self-check failed. Nothing was published or uploaded by that job.
[#214](https://github.com/cats-inc/cats-platform/pull/214) excludes the file by name and
the workflow was re-dispatched against the same draft.

The [Desktop 0.7.0 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.7.0)
was published at 2026-09-30 02:58 Taipei by the repeated run
([36614546433](https://github.com/cats-inc/cats-platform/actions/runs/36614546433)); all
eight jobs passed, including packaged Platform startup and the license gates
(`catsLicenses`, `rendererNotices` on every OS; `runtimeBundledNotices` and
`nativeWindowsNotices` on Windows, where the Runtime ships as a bundle and the voice
helper carries the .NET 8.0.31 runtime notices). Tag `v0.7.0` points at `6d53fb56`,
where the draft was created; the source manifest and the attestation record Platform
`2c637d54`, Runtime `2f167ad5` and cats-apps `1c67c428` with Usage 0.5.1
`payloadVerified`. `SHA256SUMS` covers all thirteen assets and its own self-check passed;
the downloaded Windows installer, Linux package, update metadata and source manifest
match it, and `gh attestation verify --repo cats-inc/cats-platform` succeeds for the
installer and for `SHA256SUMS` (builder `refs/heads/main@2c637d54`, run 36614546433). The
installer's SHA-512 equals `latest.yml`; `latest-mac.yml` and `latest-linux-arm64.yml`
name uploaded assets with matching sizes. Windows metadata reads company `sammykenny2`,
product `Cats`, version 0.7.0, and the file is unsigned as expected.

`0.7.0 preview · standard · macOS signed + notarized / Windows unsigned (no certificate) / Linux n/a`.
The macOS log shows Developer ID team `97JBZ3MFX5`, successful notarization, a valid
stapled ticket and a `Notarized Developer ID` Gatekeeper assessment. An installed
0.6.1 → 0.7.0 upgrade was not exercised on any OS. No provider calls were made. The
superseded 0.6.1 preview release was deleted afterwards at the owner's request; the
`v0.6.1` tag remains because the tag ruleset forbids deleting release tags.

## 2026-09-29 — Platform 0.6.1 npm and Desktop standard preview (published)

- **Companion memory in each Cat turn (#174).** A bounded excerpt of the stored companion
  session reaches every provider's per-turn Cat prompt: up to 8 active memory records and 6
  owner notes, each clipped to 280 characters. Expression guidance applies only to Cats
  with the companion role.
- **Companion profile posts (#179).** Companion Cats can publish profile posts, and the
  owner can remove them.
- **Cat profile wake and sleep (#180).** The buttons on `/entities/cats/:catId` now activate
  and deactivate the Cat's direct lane through the same channel routes as Chat.
- **Companion migration backup (#178).** 0.6.0 treated anything already at
  `<state>.pre-companion-role.bak`, including a directory, as the kept backup and migrated
  without one. Only a regular file now counts; otherwise the migration reports
  `companion_role_migration_failed` and retries on a later read. Found by the isolated
  0.5.8 → 0.6.0 profile upgrade acceptance below.
- **Distribution licenses and publisher (#176):**
  - Desktop host and sidecars now retain the Cats MIT licenses, including the
    warranty disclaimer. Runtime bundle dependencies ship their original license
    notices, generated from the actual bundle inputs and bound to that build by
    hashes. Missing or stale notices block staging and the installed-resource gate.
  - The new dependency-notice gate covers the Runtime bundle only. Third-party
    notices for the Platform server/renderer bundles and bundled .NET runtime are
    not yet included in this gate and remain distribution follow-up work.
  - The publisher is the individual maintainer `sammykenny2`. Cats / Cats Inc. remains
    the software brand; Windows metadata no longer represents it as the developer's
    company. Product name, appId, signing configuration and data paths are unchanged.
- **Runtime.** Desktop pins Runtime 0.3.4 at `af7b0b3a825f866fd5016ed22c3e2d342208b54e`, which
  produces the Runtime bundle license notices, omits URL queries from access logs and
  removes session compaction archives during permanent deletion, retaining the session if
  final file removal fails.
- **Compatibility.** A compatible patch: no new stored-data change beyond 0.6.0's companion
  migration. Usage 0.5.0 (bundled), Studio 0.2.0, the bundled knowledge and the SDK example
  all accept 0.6.x. cats-one 0.3.0 follows with a `^0.6.0` Platform range.
- **Upgrade evidence (0.6.0, isolated temporary profiles).** A profile written by npm
  0.5.8's own model code, with a Cat on the `'companion'` skill profile, restarts cleanly on
  0.5.8 and then migrates on 0.6.0: the Cat gains the companion role, the dedicated backup
  equals the original bytes, other Cats and the Cat count are unchanged, and a repeat
  startup leaves the backup untouched. With a write-denied state directory, 0.6.0 started on
  in-memory defaults and left the file intact; after access was restored it migrated with
  a correct backup. The occupied-backup-path case failed on 0.6.0 and is fixed here.
- **Windows self-update.** The owner's installed Desktop updated itself to 0.6.0 through
  electron-updater; the downloaded installer's SHA-512 matches `latest.yml` and Platform
  0.6.0 reached ready on the existing profile, which needed no companion migration. macOS
  and Linux self-update were not exercised.
- **Release plan.** The owner authorized Platform npm 0.6.1 (`latest`) and a Desktop 0.6.1
  standard preview (`unsigned=false`). Both were dispatched from a temporary `release/0.6.1`
  branch at `db445ee645b9f444e267970b13895329de71e956` so they share source; the branch was
  deleted afterwards and tag `v0.6.1` keeps the commit.
- **Upgrade evidence (0.6.1).** Repeated on npm 0.6.1 with the same isolated harness: a
  0.5.8-written profile migrates with a backup equal to its original bytes, a repeat start
  leaves it untouched, a directory at the backup path now leaves the stored legacy value
  intact and reports `companion_role_migration_failed`, clearing it lets the next start
  migrate with a backup, and a write-denied state directory leaves the file intact until
  access returns.

npm **0.6.1** was published to `latest`. The
[npm publish workflow](https://github.com/cats-inc/cats-platform/actions/runs/36520443917)
test gate passed 5,318 tests with 59 skipped and no failures; the tarball has 3,674 files.
cats-one 0.3.0 (`^0.6.0`) followed: a fresh-cache `npx --yes cats-one@latest --platform-only --help`
resolved cats-one 0.3.0, Platform 0.6.1 and Runtime 0.3.2.

The [Desktop 0.6.1 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.6.1)
was published at 2026-09-29 12:17 Taipei. All eight
[release jobs](https://github.com/cats-inc/cats-platform/actions/runs/36520446539) passed,
including packaged Platform startup and the new Cats license check (`catsLicenses: true`) on
Windows, macOS and Linux. The source manifest records Platform `db445ee6`, Runtime `af7b0b3a`
and cats-apps `2c077cbf` with Usage 0.5.0 `payloadVerified`; the source ZIP matches its
checksum file. All three update metadata files name uploaded assets with matching sizes, and
the downloaded Windows installer and Linux package match their GitHub SHA-256 digests and
updater SHA-512 values.

`0.6.1 preview · standard · macOS signed + notarized / Windows unsigned (no certificate) / Linux n/a`.
The macOS log shows Developer ID team `97JBZ3MFX5`, successful notarization, a valid stapled
ticket and a `Notarized Developer ID` Gatekeeper assessment. Self-update from 0.6.0 is expected
under the same profile; macOS and Linux self-update were not exercised. No provider calls
were made.

## 2026-09-29 — Platform 0.6.0 npm and Desktop standard preview (published)

- **Minor boundary.** A Cat's companion setting is now a Cat role instead of the
  `'companion'` `skillProfile` value ([ADR-124](decisions/124-model-companion-as-a-cat-role-not-a-skill-profile.md)).
  The API no longer accepts that value. On first start, existing chat state is migrated
  once: the original bytes are kept in `<state>.pre-companion-role.bak`, the converted
  snapshot is validated and atomically replaced, and a failed validation or backup
  leaves the file unchanged and reports `companion_role_migration_failed`.
- **App SDK entry.** npm consumers can import `@cats-inc/cats-platform/app-sdk`
  ([ADR-123](decisions/123-expose-app-sdk-contract-as-platform-npm-subpath.md)): manifest and
  browser SDK types, the installer's own `validateRendererAppPackage`, `decodeAppPackage`,
  `supportsVersion` and a cross-platform deterministic `encodeAppPackage`. `exports` allows
  only `.`, `./package.json` and `./app-sdk`; other deep package paths no longer resolve.
- **App packages.** The installer now accepts App files up to the documented 8 MiB. Earlier
  hosts rejected files above about 3 MiB with `Maximum call stack size exceeded`.
- **Bundled knowledge.** The Orchestrator and code-entry knowledge bundles move to
  `platformRange: "0.6.x"` as revision `2026-09-29.1`; their entries are unchanged. The
  loaders and Desktop staging reject a bundle whose range excludes the running Platform.
- **Model picker.** With a catalog that provides it, a small "i" beside the Model label names
  the catalog basis (channel or plan).
- **Desktop Apps.** Usage 0.4.0 declares `catsPlatform ^0.5.0` and cannot install on 0.6.0.
  Desktop 0.6.0 selects Usage 0.5.0, which only raises that range to `^0.6.0` and is built
  with the App SDK encoder; its renderer and permissions are unchanged. Studio 0.1.0 declares
  `^0.5.11`, so the 0.6.0 installer rejects it; a Studio release for 0.6.x is not included.
- **Usage 0.5.0 published.** [usage-v0.5.0](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.5.0)
  from cats-apps `2c077cbf9265ff0207292ca54754b3298fa28144`, SHA-256
  `66bbb0acbee92cf114a7836dccbfbad261e702caeb268007f12536c804b7c47d`, built with the npm
  0.6.0 App SDK. The downloaded archive, asset digest, lock and provenance agree; host 0.6.0
  with SDK 1.3.0 accepts it through the pinned lock. Its LICENSE and renderer payloads equal
  Usage 0.4.0. A local rebuild at that commit after `npm ci --ignore-scripts`, as the
  source bundle now does, reproduced the payload, bytes and source digest.
- **Release plan.** The owner authorized Platform npm 0.6.0 (`latest`), Usage 0.5.0 and a
  Desktop 0.6.0 standard preview (`unsigned=false`). Runtime is pinned to 0.3.4 at
  `ea45e95aba99ca5a4aec0532ef2db1db2bf512e3`, which provides the catalog basis. cats-one's
  `^0.5.1` range keeps `npx cats-one` on Platform 0.5.x until a separately authorized
  launcher release.
- **Source.** npm 0.6.0 and Desktop 0.6.0 share source. Desktop was dispatched from
  `release/0.6.0`: the npm source `170683c28097b1cf36242c08a4cfe67e33b45eb1` plus only the
  Usage 0.5.0 lock commit (`e999bde5f340d0969ed44622fcc798e3c5ddc265`, tag `v0.6.0`).
  #174 (companion memory in each Cat turn prompt) merged to main after the npm source and
  is not in 0.6.0.
- **Upgrade evidence.** `tests/companion-role.test.js` checks that the dedicated backup
  equals the original bytes, the main file is rewritten, a second read is stable, and the
  `.bak` recovery path migrates too. No installed
  0.5.x → 0.6.0 profile upgrade or self-update was exercised.

npm **0.6.0** was published to `latest` at 2026-09-29 09:17 Taipei from `170683c2`. The
[npm publish workflow](https://github.com/cats-inc/cats-platform/actions/runs/36506467329)
test gate passed 5,302 tests with 59 skipped and no failures; the tarball has 3,661 files
and integrity `sha512-JhETtdy7ichsfHDC0blY4FWp7JS5e3wpz87tmz3LgixUnu6p3XhYiJMhF1pgC8eivaRY/4/uu6O1UCnO2EH0Dw==`.
The downloaded registry tarball contains the `./app-sdk` targets and `packages/app-sdk`
format and encoder files, and its `exports` allow only `.`, `./package.json` and `./app-sdk`.
A fresh project installed it from npm, imported the entry, validated a package on host
0.6.0, reproduced the encoder golden hash, typechecked with NodeNext and Bundler resolution,
and got `ERR_PACKAGE_PATH_NOT_EXPORTED` for a deep path.

The [Desktop 0.6.0 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.6.0)
was published at 2026-09-29 09:52 Taipei. All eight
[release jobs](https://github.com/cats-inc/cats-platform/actions/runs/36509427774) passed,
including isolated packaged Platform startup (`platformStartup: true`) on Windows, macOS
and Linux. The source manifest records Platform `e999bde5`, Runtime `ea45e95a` and cats-apps
`2c077cbf` with Usage 0.5.0 `payloadVerified`, so the new `npm ci` App rebuild ran in CI.
The [complete source ZIP](https://github.com/cats-inc/cats-platform/releases/download/v0.6.0/Cats-v0.6.0-source.zip)
has SHA-256 `0203314858faeeed24c1760c5147b1f71f4fda5f76768049a65bd2d5980ce1e6`, matching its
checksum file. All three update metadata files name uploaded assets with matching sizes;
the downloaded Windows installer and Linux package match their GitHub SHA-256 digests and
updater SHA-512 values.

`0.6.0 preview · standard · macOS signed + notarized / Windows unsigned (no certificate) / Linux n/a`.
The macOS log shows Developer ID team `97JBZ3MFX5`, successful notarization, a valid stapled
ticket and a `Notarized Developer ID` Gatekeeper assessment. Self-update from 0.5.15 is
expected on each OS under the same standard profile but was not exercised. No provider calls
were made.

## 2026-09-29 — Desktop 0.5.15 standard preview (published)

- The 0.5.14 installed launcher could not start Platform because the sidecar
  omitted `fflate` 0.8.3, which the managed Plugin package reader imports at startup.
  Runtime started normally. Source-build and offline App checks did not execute
  the actual packaged server, so they failed to catch this dependency omission.
- Sidecar staging now includes `fflate` for split and bundle layouts. Every OS's
  release check must start its packaged Platform from an isolated copy, verify
  child-owned readiness and HTTP health, and record the result in the publish gate.
  Ancestor dependency directories and hung shutdowns are covered by regression tests.
- Local recovery added only the missing locked dependency to the installed 0.5.14;
  after Retry, the user confirmed normal entry and the host recorded Platform ready.
  This was a local repair, not a replacement of published 0.5.14 assets or an update
  to another released version. No user profile reset or test conversations were used.
- Validation: 71 focused checks and independent review passed. A fresh unpublished
  Windows NSIS build includes fflate; its unpacked resources passed offline Usage
  activation and isolated Platform startup under native Node and packaged Electron.
- The owner authorized a 0.5.15 standard preview (`unsigned=false`). Runtime remains
  0.3.4 at `7c1b80c21ebe7031ec2c8f61677277bb781ec8fd`; Usage remains the exact 0.4.0
  artifact. This compatible packaging patch changes no stored-data contract and
  publishes no Runtime, App or npm version.
- Verified trust: macOS signed and notarized with Developer ID team `97JBZ3MFX5`,
  Windows unsigned because no certificate is configured, Linux n/a. No installed
  0.5.15 upgrade or self-update acceptance was performed; the owner's confirmed
  local recovery remains the repaired 0.5.14 installation.

Published at 2026-09-29 06:06 Taipei from Platform
`f84c7dfb50c23dd93467d5cf24918a9c435bb383`.
[Full source CI](https://github.com/cats-inc/cats-platform/actions/runs/36488571818)
passed (5,255 passed, 59 skipped, zero failures), after correcting a stale
Orchestrator distribution test fixture exposed by the first CI run. All eight
[release jobs](https://github.com/cats-inc/cats-platform/actions/runs/36489451173)
passed, including actual isolated packaged Platform startup and offline Usage
activation on Windows, macOS and Linux. All three receipts match the source manifest.

The [published preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.15)
includes the [complete source ZIP](https://github.com/cats-inc/cats-platform/releases/download/v0.5.15/Cats-v0.5.15-source.zip).
Its 12,936,231 bytes have SHA-256
`870ab043a1d367cbb956fdad40ae9500e664a2acb7159f05c6f237244f3523e2`.
Unauthenticated public downloads match the published asset digests and draft
downloads; all 4,225 archived files match the exact committed-source preflight
payload (3,100 Platform, 1,053 Runtime and 70 Apps files, plus two archive documents).
This verifies source integrity and includes the new startup verifier. A fresh
extracted-source clean build was not repeated for 0.5.15; the 0.5.14 acceptance below
records that separate check.

## 2026-09-29 — Desktop 0.5.14 standard preview (published)

- Adds a complete first-party source ZIP, SHA-256 checksum and source manifest to
  Desktop releases, linked at the top of the release notes. GitHub's automatic
  source downloads continue to contain Platform only.
- Resolves Runtime once for all three OS builds and the source bundle. The archive
  includes exact Platform/Runtime trees and the selected Usage producer revision,
  validated against Usage 0.4.0's existing published bytes and rebuilt payload.
- Publication is gated on source integrity and source identities read from all
  three packaged hosts. Source archives cannot be selected as updater ZIPs.
- Compatible patch: no persisted data migration, new App selection or Runtime/npm/
  launcher publication. Managed Plugin experiments remain opt-in and unbundled.
- Standard profile (`unsigned=false`): macOS signed and notarized with Developer ID
  team `97JBZ3MFX5`, Windows unsigned because no certificate is configured, Linux n/a.
  This source-package acceptance did not install Desktop or exercise self-update.

Published at 2026-09-29 05:09 Taipei from Platform
`ddfa30fb40ddf1ac0c5be4fd1c6640b46b7ef49c`, with Runtime 0.3.4 at
`7c1b80c21ebe7031ec2c8f61677277bb781ec8fd` and Usage 0.4.0 producer sources at
`cb48b229295d5cb4bb6f3009fbe0b9e81afe1b63`.
[Full source CI](https://github.com/cats-inc/cats-platform/actions/runs/36482494829)
passed (5,254 passed, 59 skipped, zero failures), and all eight jobs in the
[standard-preview workflow](https://github.com/cats-inc/cats-platform/actions/runs/36483520103)
succeeded, including the three packaged source receipts and source publication gate.

The [published preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.14)
links the [complete source ZIP](https://github.com/cats-inc/cats-platform/releases/download/v0.5.14/Cats-v0.5.14-source.zip)
and [source manifest](https://github.com/cats-inc/cats-platform/releases/download/v0.5.14/Cats-v0.5.14-sources.json).
The 12,928,754-byte ZIP contains 3,098 Platform, 1,053 Runtime and 70 Apps files,
plus the manifest and build instructions. Its SHA-256 is
`a066869e4b68fe408a6aeb20d3f23fd80579c2f42197bef985404aabb437a445`.
Unauthenticated public downloads match both the release asset digests and the
archive used for a clean Windows/Node 24.21.0 build: Runtime `npm ci` + `npm run build`,
Platform `npm ci` + `npm rebuild electron` + `npm run build:no-mobile`, and the
included Usage producer build all passed. Usage's decoded payload and source digest
match its published artifact; all 4,223 archived files remained unchanged after
building. No local checkout, Git metadata or pre-existing dependency directory was
used by those extracted-source builds.

## 2026-09-28 — Desktop 0.5.13 standard preview (published)

- Packages all Platform changes through `b0c503bb877b20c341d3ba3f04c0eb4d44248dd6`,
  including App SDK 1.3 image operations and recovery of retained Grok images after
  a home-relative session-path collection failure.
- Pins Runtime 0.3.4 source to `9a35b7f4db77ed82715b229fb629f84f0115bfc5` on every OS.
  This includes the other delivery tracks' native-session path matching, provider-reported
  served models/run logs, Copilot discovered-session model fields and Kiro v1 engine fix,
  alongside bounded image generation and source-path recovery.
- Compatible Desktop patch; no persisted schema conversion or profile reset. Runtime,
  Platform npm, launcher and App publication are not part of this release.
- Uses the standard preview signing profile (`unsigned=false`). Verified trust:
  macOS signed + notarized (Developer ID team `97JBZ3MFX5`), Windows unsigned:
  no certificate, Linux n/a. The standard-preview 0.5.10 update path preserves
  macOS signed to signed with the same team, Windows unsigned to unsigned and Linux
  signature-independent updates. No new installed-upgrade acceptance was performed.
- The published bundle retains the exact Usage 0.4.0 archive. Studio 0.1.0 was selected
  only by the preceding local installer, and is not in the published default App lock.
  App/SDK/market architecture and Studio distribution policy are deferred to the next
  discussion; this release changes no App selection or installation policy.

Published from Platform `d44e680800e2ba4c787f9c3182be5c7ca50e96ac` at
2026-09-28 13:37 Taipei. Platform/Runtime source CI and the exact
[candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36381628091)
passed. All seven [Desktop jobs](https://github.com/cats-inc/cats-platform/actions/runs/36382253778)
passed and [the prerelease](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.13)
contains ten assets. All three build logs confirm the fixed Runtime SHA; macOS notarization,
stapled-ticket validation and Gatekeeper assessment passed. Update metadata names/sizes
match the published assets. Downloaded Windows and Linux packages match their GitHub
SHA-256 and updater SHA-512 values. Linux package inspection confirms SDK 1.3.0, Runtime
0.3.4 with Kiro v1, reported-model run logs and image recovery, and the exact Usage pin.
No new provider generation was performed.

## 2026-09-28 — Local Desktop 0.5.12 / Studio image collection fix

- Resolves Grok's home-relative session directory before validating generated image paths.
- Studio can recover a prior `invalid_image_source` result from its existing validated
  image and matching session evidence. The original Runtime receipt is backed up; the
  existing Core task/run is retained. Recovery never submits another generation.
- Local installer update only. Studio 0.1.0, Usage 0.4.0 and SDK 1.3.0 remain unchanged.
  No persisted schema changes or public release are involved.

## 2026-09-28 — Local Desktop 0.5.11 / Studio slice

- Adds compatible App SDK 1.3 image jobs, cancellation, retained image preview and
  download through Runtime. Studio 0.1.0 is a separate Home App beside Usage 0.4.0.
- Local installer only; no public Desktop/App tag, release or npm publication.
  The canonical published App selection remains unchanged. The local selection
  pins the existing published Usage archive and the new Studio archive.
- Existing Core/profile formats are preserved. Studio adds Core task/run/artifact
  metadata and app-owned image files; no reset or migration is required.
- Native Grok only, one square image per explicit submission, no automatic retries.
  Editing/video and install/remove UX are deferred. Acceptance uses isolated
  fixtures and the earlier single live-image spike; no new paid Grok call was made.

See [PLAN-111](plans/PLAN-111-app-image-generation.md) for installation evidence.

## 2026-09-28 — Desktop 0.5.10 standard preview (published)

Desktop **0.5.10** was published on 2026-09-28 (Taipei) as a
[standard-profile preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.10)
from `c422d950302840d665778e8a5b45ff49bccb0c7d`; Platform npm is not published at this
version and npm `latest` stays 0.5.8. Every OS build bundles Runtime **0.3.4** at
`0804e238e1c9b6a29c3357301336400ea4e3ac64`, which stops Auggie and Kiro replies from
flashing an empty bubble below them, completes turns that end without a result, reads
Kiro 2.24's session store, runs Junie models by the setting IDs its `--model` accepts,
and reports a request Pi ends with an error as a failure with Pi's message. Platform's
model picker now selects a room's saved catalog entry when the saved model is that
entry's execution ID, such as Pi's `openai-codex/gpt-6-sol` running as `gpt-6-sol`; it
previously showed the first row, which then could not be picked. No public API,
configuration or persisted-data contract changes; no migration, launcher minimum or App
change is required; the Usage 0.4.0 pin is unchanged.

`0.5.10 preview · standard · macOS signed + notarized / Windows unsigned (no certificate) / Linux n/a`.
The macOS build log shows the Developer ID signature, successful notarization and a
`Notarized Developer ID` Gatekeeper assessment. Installs of 0.5.9 can self-update on
every OS: macOS stays signed to signed with the same team, Windows unsigned to unsigned
and Linux verifies no signature. The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36361034630)
passed all seven jobs and published ten assets, and all three update metadata files
reference the uploaded assets with matching sizes. The downloaded Windows installer and
Linux package match their GitHub SHA-256 digests and updater SHA-512 values. The Linux
package contains Runtime 0.3.4 with the stream, turn-completion, Kiro store, stderr and
Pi error changes and the 15 Junie setting IDs, and its renderer bundle contains the
picker's entry-first selection. PR CI for both source changes passed before merge; no
installed upgrade was exercised.

## 2026-09-28 — Desktop 0.5.9 standard preview (published)

Desktop **0.5.9** was published on 2026-09-28 (Taipei) as a
[standard-profile preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.9)
from `177cc696c98d30783ddd5a510f153cc73479c8da`; Platform npm is not published at this
version and npm `latest` stays 0.5.8. Every OS build bundles Runtime **0.3.3** at
`d061e9b35bb527633d8448274b8fa6c13ffb8851`, which fixes Windows launches that cut
multi-line or quoted prompts short for Cline, Kilo, Cursor and Junie, stops Cursor
segments before a tool call from appearing twice, removes OpenCode's withdrawn Union
Alpha Free and logs each run's model and outcome. Platform stops copying a
participant's current lease onto every earlier session in a room's history, so each
session keeps the model and error it ran with. No public API, configuration or
persisted-data contract changes; no migration, launcher minimum or App change is
required; the Usage 0.4.0 pin is unchanged.

`0.5.9 preview · standard · macOS signed + notarized / Windows unsigned (no certificate) / Linux n/a`.
The macOS build log shows the Developer ID signature, successful notarization and a
`Notarized Developer ID` Gatekeeper assessment. Installs of 0.5.8 can self-update on
every OS: macOS stays signed to signed with the same team, Windows unsigned to unsigned
and Linux verifies no signature. The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36355606476)
passed all seven jobs and published ten assets, and all three update metadata files
reference the uploaded assets with matching sizes. The downloaded Windows installer and
Linux package match their GitHub SHA-256 digests and updater SHA-512 values. The Linux
package contains Runtime 0.3.3 with the Cursor and Junie launchers, the node-shim,
Cursor-replay and run-log changes, the five-row OpenCode shortlist and the Platform
session-history fix. PR CI for both source changes passed before merge; no installed
upgrade was exercised.

## 2026-09-28 — Platform 0.5.8 npm and Desktop standard preview (published)

Platform **0.5.8** was published on 2026-09-28 (Taipei) to npm `latest` and as a
[Desktop standard preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.8),
from `072ba670dc8cb7459d7a1c245b88c3738759ac42`. Desktop bundles Runtime **0.3.2**
at `9fefd8e41512f200de6b7d4f1ed93fb7aa5e4dcb` on every OS. It includes ordinary-agent contribution and
diagnostic entry points, owner-reviewed knowledge adoption/deletion, and isolated
development/practice mechanisms described in PLAN-109. Compatibility review found
no breaking public API, CLI/config or persisted-data contract since npm 0.5.1;
no new data migration or launcher minimum is required. The bounded Windows native
knowledge flow and paired skill-distribution check passed; wider live quality and
other-OS acceptance remain separate.

[Source CI](https://github.com/cats-inc/cats-platform/actions/runs/36349951984) and
the [npm publication gate](https://github.com/cats-inc/cats-platform/actions/runs/36350012826)
both passed 5,231 tests, with 59 skipped and no failures. The
[Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36350464314)
passed all seven jobs and published ten assets. All three update metadata files
reference the expected uploaded assets. The downloaded Windows installer matches
GitHub SHA-256 and updater SHA-512; the inspected Linux package matches its public
SHA-256 and contains the exact recorded knowledge identities and 36 preview skills.
Both npm registry versions, source commits and tarball integrity are verified.
Both public tarballs also passed installation into a new private prefix and CLI
entry-point checks. The installed Platform loaders read both bundled knowledge
files in English and Traditional Chinese; installed Runtime exposes 33 release
skills with the preview directory physically absent. No provider calls were made.

Trust is macOS **signed + notarized**, Windows **unsigned: no certificate** and
Linux **n/a**. macOS retains team `97JBZ3MFX5` and the same certificate as 0.5.7;
app/helper signature, stapled ticket and Gatekeeper checks passed. Standard 0.5.7
Windows/macOS installations retain their self-update path; Linux still uses a
manual `.deb` install. No installed user profile was replaced during verification.

Newest dates go first. Each dated section should include behavior changes,
migration steps, and any deprecations introduced in that release.

Use this shape for new entries:

```md
## YYYY-MM-DD

### Change title

Behavior change:

Migration steps:

Deprecations:
```

## 2026-09-27 (0.5.7 preview, standard profile — publication)

Behavior change:

- Source-development agents can operate their isolated Cats Candidate through
  screenshot-bound click, text, key and scroll commands. Every action binds the
  candidate instance and a recent single-use frame, with DPI/zoom conversion and
  invalidation on navigation, resize or shutdown. Input stays in that candidate's
  main web window; it exposes no arbitrary script or OS-wide input executor.
- An input receipt confirms dispatch only. The agent must inspect a new screenshot
  to verify the effect, including after an error/timeout that may follow partial
  input. Native Windows validation covered all four actions at 125% zoom and
  actual candidate setup navigation/text entry, followed by owned-process cleanup.
- These are opt-in source-development commands. Normal installed Desktop launches
  have no candidate controller. Existing user-facing behavior is otherwise unchanged.

Migration steps:

No existing data conversion is required. This compatible patch targets Desktop
only; no npm package was published. Runtime 0.3.1 remains pinned to
`5396566012c9cf7783bf05203806df8c849e348b`, the same source as Desktop 0.5.6.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`;
its `catsPlatform` range `^0.5.0` includes 0.5.7.

The standard profile was used: verified platform trust is macOS signed +
notarized, Windows unsigned: no certificate, and Linux n/a. Self-update from
standard-profile 0.5.6 is expected to remain supported on Windows/Linux and on
macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.6 build log.
No new installed-update acceptance is claimed. The existing Windows voice input
issue remains outside this change.

Deprecations:

None.

Release verification:

The functional source `c41fa3b772ec3bd8c3c639e00a65a595abdb331e` passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36291374832):
5,155 passed, 59 skipped, zero failures. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36288093804).
The [version-candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36296685016)
also passed: 5,155 passed, 59 skipped, zero failures.

The [0.5.7 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.7)
was published from Platform `fbd4093cf5abe4ada4962049cc180477f7abe9ae`.
All seven [Desktop workflow jobs](https://github.com/cats-inc/cats-platform/actions/runs/36296711664)
passed with `unsigned=false`; all three builds recorded the pinned Runtime SHA.
The workflow-created tag resolves to that exact Platform commit.

- All ten assets are published; the release is a prerelease and appears first
  in the release feed. All three update metadata files report 0.5.7 and reference
  published assets with matching names and sizes. The metadata files' SHA-256
  digests match GitHub's asset records.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded on the build runner.
- Windows: the downloaded 145,042,055-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and SHA-256 matches GitHub's
  asset digest `78ceef7ac2bd15b06ee58eff78bdac6699c12bd0218f344efe8e8b49c0f7e57b`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No installer was executed and no installed user profile was changed.

## 2026-09-27 (0.5.6 preview, standard profile — publication)

Behavior change:

- Right-clicking in Desktop opens a native edit menu: Copy for selected text,
  and the full edit set in editable fields. Elsewhere no menu appears.
- Message copy buttons work in Desktop. The renderer now allows clipboard
  writes; clipboard reads stay denied.
- Conversation diagnostics reports also include retained UI exceptions from the
  collecting window: memory-only, at most 20 per window since page load and eight
  per report, scrubbed of common secrets and URL queries, and cleared on reload.
  They describe the page at failure time, not a proven cause.
- The collapsed Catlas "help me get started" chip is centered on the new Code
  conversation page.
- Source checkouts gain `npm run desktop:candidate` to build and open an
  independent Cats Candidate with empty private state from a development
  conversation. It is a development command; installed Desktop behavior does not
  change.
- The bundled Runtime lists GitHub Copilot's full picker for a Copilot Pro
  account (20 rows) with per-row reasoning, context and Auto tier controls, and
  Pi's full `openai-codex` channel (8 rows) with per-model thinking levels that
  default to medium. Rows without a marked default start at their first value.

Known issue:

The Windows voice input issue recorded under 0.5.5 is not fixed; only its setup
guidance changed.

Migration steps:

No existing data conversion is required.

This compatible patch publishes Desktop only; no npm package was published.
Runtime 0.3.1 is pinned to `5396566012c9cf7783bf05203806df8c849e348b`.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`; its
`catsPlatform` range `^0.5.0` includes 0.5.6.

The standard signing profile was used: verified platform trust is macOS
signed + notarized, Windows unsigned: no certificate, and Linux n/a. Self-update
from standard-profile 0.5.5 is expected to remain supported on Windows/Linux
and on macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.5 build log. No new installed-update acceptance is claimed.

Deprecations:

None.

Release verification:

Platform `9188a1104ce1f46e4f802b59e99c210a2f69987f` passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36285726614).
The later source candidate command (`dfb7c4c1`) is covered by the version
candidate's CI. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36288093804).
The [version candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36288365820)
passed with 5,148 tests passed, 59 skipped and zero failures.

The [0.5.6 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.6)
was published from Platform `27489f3668c243629bfd2b94a887a4f652491c54`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36288800513)
passed all seven jobs with `unsigned=false`; all three OS builds recorded the
same pinned Runtime SHA. The workflow created the matching preview tag.

- All ten assets are published, the release is a prerelease, and it appears first
  in the release feed. The three update metadata files report 0.5.6 and reference
  published assets with matching names and sizes.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded. This is build-runner
  evidence, not a new published-DMG inspection on a Mac.
- Windows: the downloaded 145,036,951-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and its SHA-256 matches the
  GitHub asset digest
  `d7ac4d125e278c137868c1c846f6104ee4504203e05ed8ed38b14b692e7c3b9c`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No provider inference or installed user-profile writes were performed.

## 2026-09-27 (0.5.5 preview, standard profile — publication)

Behavior change:

- The Chat and Code composers can attach a conversation diagnostics report. An
  owner or administrator chooses the conversation, previews the report, then
  attaches it as a removable text file through the normal upload and send flow.
  The report names the Platform/Runtime versions, the selected conversation and
  working directory, up to eight linked sessions, recent system errors and, when
  enabled, conversation live-trace summaries. It excludes raw provider logs,
  transcripts, tool arguments, arbitrary files and browser console output, and
  scrubs common credentials. Collecting it makes no provider request and writes
  no product data.
- The bundled Runtime includes Auggie's full 34-row 0.36.0 picker catalog in
  picker order. Opus 4.8 is the only default, because the picker marks it; no
  row has an effort control.
- The mobile client source now renders agent replies as markdown. The mobile
  client ships separately through the app stores, so this Desktop release does
  not change it.

Migration steps:

No existing data conversion is required. The diagnostics endpoint is read-only.

This compatible patch publishes Desktop only; no npm package was published.
Runtime 0.3.1 is pinned to `3aae1a48e9d85d3d4cb903bb82cc1408882e69ed`.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`; its
`catsPlatform` range `^0.5.0` includes 0.5.5.

The standard signing profile was used: verified platform trust is macOS
signed + notarized, Windows unsigned: no certificate, and Linux n/a. Self-update
from standard-profile 0.5.4 is expected to remain supported on Windows/Linux
and on macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.4 build log. No new installed-update acceptance is claimed.

Deprecations:

None.

Release verification:

Platform `0791d2797de9f10f10627c7d52952edb8c5a283e` passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36276722578).
Two earlier main runs failed on the new diagnostics dialog test until
`ad7f9b13` bound its mock to the active document. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36277158825).
The [version candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36277477096)
passed with 5,136 tests passed, 59 skipped and zero failures.

The [0.5.5 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.5)
was published from Platform `d0da490abda2ab2a647be3071e5347a67c149faa`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36277916959)
passed all seven jobs with `unsigned=false`; all three OS builds recorded the
same pinned Runtime SHA. The workflow created the matching preview tag.

- All ten assets are published, the release is a prerelease, and it appears first
  in the release feed. The three update metadata files report 0.5.5 and reference
  published assets with matching names and sizes.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded. This is build-runner
  evidence, not a new published-DMG inspection on a Mac.
- Windows: the downloaded 145,028,094-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and its SHA-256 matches the
  GitHub asset digest
  `b0bc94f200027c09997d2dea663f5b5a2e8d3510c9762522dcd3731a4ca891b7`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No provider inference or installed user-profile writes were performed.

Post-publication known issue (reported 2026-09-27): On an installed Windows
0.5.5 Desktop app, the composer microphone showed "Voice input is not available
on this device" while Windows Online speech recognition was off. Enabling that
setting allowed the button to enter its red listening state, but no spoken text
appeared in the composer. The missing-transcript cause is still unconfirmed;
the listening indicator alone does not establish recognition or insertion.
The Windows helper's predefined dictation grammar requires Microsoft online
speech; installing a local speech pack does not make that grammar offline.
See [Composer Voice Input Permissions](./setup-guide.md#composer-voice-input-permissions).

## 2026-09-27 (0.5.4 preview, standard profile — publication)

Behavior change:

- Agent replies in Chat, Work and Code transcripts, including live streamed text,
  render as markdown: emphasis, lists, headings, quotes, code blocks, tables,
  task lists and `[text](url)` links. Single newlines stay line breaks. User,
  system and orchestrator messages remain plain text, and mobile still shows
  every message as plain text.
- Only http(s) links in agent replies are clickable and open in the system
  browser. Other targets, such as local file paths, show as inert text with the
  target as a tooltip. Raw HTML is shown as text; remote images appear as links
  instead of loading.
- Bare URLs and internal routes end at CJK and full-width punctuation, so text
  such as `)、` directly after a URL no longer becomes part of the link.
- The bundled Runtime includes Kiro's full 20-row 2.24.1 picker catalog. The ten
  rows with an effort control send it as `--effort`; with no declared default,
  selection starts at each row's first value and overrides Kiro's saved model
  defaults.

Migration steps:

No existing data conversion is required. Stored messages are unchanged; only
their display changes.

This compatible patch publishes Desktop only; no npm package was published.
Runtime 0.3.1 is pinned to `65e05d5af90182bb08b23a3d8210667abe3fd426`.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`; its
`catsPlatform` range `^0.5.0` includes 0.5.4.

The standard signing profile was used: verified platform trust is macOS
signed + notarized, Windows unsigned: no certificate, and Linux n/a. Self-update
from standard-profile 0.5.3 is expected to remain supported on Windows/Linux
and on macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.3 build log. No new installed-update acceptance is claimed.

Deprecations:

None.

Release verification:

The markdown change passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36272436338)
at `386fd2ac0a122cf2e7ebe551f8de9e8ad0c68717`. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36272184397).
The [version candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36273623470)
passed with 5,123 tests passed, 59 skipped and zero failures.

The [0.5.4 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.4)
was published from Platform `bc967980058a4a81d9258ddf44caea2ec9527cba`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36274109738)
passed all seven jobs with `unsigned=false`; all three OS builds recorded the
same pinned Runtime SHA. The workflow created the matching preview tag.

- All ten assets are published, the release is a prerelease, and it appears first
  in the release feed. The three update metadata files report 0.5.4 and reference
  published assets with matching names and sizes.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded. This is build-runner
  evidence, not a new published-DMG inspection on a Mac.
- Windows: the downloaded 145,018,283-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and its SHA-256 matches the
  GitHub asset digest
  `ba2cf7e6b98e390e0113e209dfbbbcd911394573244ea0d0bb19bc6d2401e210`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No provider inference or installed user-profile writes were performed.

## 2026-09-27 (0.5.3 preview, standard profile — publication)

Behavior change:

- Code > Artifacts > Contribute / adopt knowledge opens the minimal bilingual
  Catlas/Orchestrator editor. Save a draft, compare it, explicitly confirm review,
  then adopt locally. Revoke restores bundled content. Saving alone changes no
  consumer behavior, and adopted text remains visibly unverified. Updated
  bundles suspend stale overrides; applicability and permissions stay fixed.
- Knowledge artifact previews display bilingual draft contents as plain text.
  Page controls use the shared English and Traditional Chinese translations.
- Model controls without a declared default select their first option. The
  bundled Runtime includes Junie's full 15-model catalog and per-model effort
  choices from the accepted 26.9.22 picker capture.

Migration steps:

No existing data conversion is required. Manual contributions use an additive,
profile-local store with validation, backup and atomic replacement. The page
does not invoke a model or automatically promote knowledge into shipped bundles.

This compatible patch publishes Desktop only; no npm package was published.
Runtime 0.3.1 is pinned to `8cdde2906b5c7175672664dd2fabbe8147555ced`.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.

The standard signing profile was used: verified platform trust is macOS
signed + notarized, Windows unsigned: no certificate, and Linux n/a. Self-update
from standard-profile 0.5.2 is expected to remain supported on Windows/Linux
and on macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.2 build log. No new installed-update acceptance is claimed.

Deprecations:

None.

Release verification:

The feature and CI repair passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36262402507)
at `182610f237c730d0ba0438453f055da2fec9601e`. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36235872728).
The [version candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36263941765)
passed with 5,102 tests passed, 59 skipped and zero failures.

The [0.5.3 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.3)
was published from Platform `c2864623010e7664dfa021c726ec010dec42ff3a`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36264530657)
passed all seven jobs with `unsigned=false`; all three OS builds recorded the
same pinned Runtime SHA. The workflow created the matching preview tag.

- All ten assets are published, the release is a prerelease, and it appears first
  in the release feed. The three update metadata files report 0.5.3 and reference
  published assets with matching names and sizes.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded. This is build-runner
  evidence, not a new published-DMG inspection on a Mac.
- Windows: the downloaded 144,721,160-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and its SHA-256 matches the
  GitHub asset digest
  `167d0c9943e75845af11ca077a8da6e64271f685cec23c2101ffc80e2098ee44`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No provider inference or installed user-profile writes were performed.

## 2026-09-26 (0.5.2 preview, standard profile — publication)

Behavior change:

Desktop 0.5.2 is a published compatible patch using the standard signing profile.
Runtime now prepares managed skill files for Codex in its own read-only sandboxes
without granting the provider write access. Source/worktree directories remain protected,
and strict skill delivery remains consistent during message rehydration.

The developer-only authoring host can create an attributed, unverified knowledge
draft using the normal Desktop-managed app lifecycle. Native Windows acceptance
produced one draft within its token threshold. This host/tooling is excluded from
shipping asset inventories; the preview does not add an end-user authoring button
or promote the generated knowledge. Independent content evaluation remains open.

Migration steps:

None beyond the existing 0.5.1 upgrade behavior. This change adds no persisted
format or breaking API. Existing Usage 0.4.0 and 0.5.x knowledge bundles remain
compatible. Runtime 0.3.1 is bundled from source commit
`98b6755f8698300b2c1881c8018e303c02a29c69`; its npm package and all other npm
packages are not published by this release. The Usage 0.4.0 artifact retains
SHA-256 `7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.

Self-update from the previous standard-profile Desktop 0.5.1 is expected to work
on Windows and Linux. The macOS app retains the same Developer ID team
`97JBZ3MFX5` and signing certificate as 0.5.1, confirmed in both build logs, so its
signed-to-signed update remains compatible. This release has not passed a new
installed 0.5.1-to-0.5.2 update acceptance check on any OS.

Deprecations:

None.

Release verification:

Rebased focused validation passed: Runtime 135 cases, Platform 49 cases, Runtime
TypeScript build, Platform server/host builds and the 0.5.2 version guard.
Independent integration review found no code blockers. Full CI passed before
normal auto-merge: [Runtime #97](https://github.com/cats-inc/cats-runtime/pull/97)
(2,449 passed, 5 skipped) and
[Platform #148](https://github.com/cats-inc/cats-platform/pull/148)
(4,864 passed, 59 skipped); no failed tests.

The [0.5.2 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.2)
was published from Platform `b2a56ece01f7c4ab6a662c69cef2d6307405e936`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36195340100)
passed 7/7 jobs with `unsigned=false` and the immutable Runtime SHA above, checked
out by every OS build. The workflow created the preview tag; it was not pushed.

- All ten expected assets are published. The release is a prerelease and appears
  first in the releases feed. All three update metadata files report 0.5.2 and
  reference published assets with matching names and sizes.
- macOS: signed + notarized. The app and native helper passed signature checks;
  stapling validation passed and Gatekeeper reported `source=Notarized Developer ID`.
  This is build-runner evidence; the published DMG was not rechecked on this
  Windows host.
- Windows: unsigned: no certificate. The downloaded 144,703,731-byte installer
  reports Authenticode `NotSigned`; its SHA-512 matches `latest.yml` and SHA-256
  matches the GitHub asset digest
  `0510d7218931c2ba1bfc64a32e1908293b49066cd38e3459fa1b7f523e661444`.
- Linux: n/a. All three builds passed bundled App version/offline activation
  checks and retained preview content eligibility.

No npm publish workflow or additional native provider inference was run.

## 2026-09-26 (0.5.1 preview, standard profile — publication)

Behavior change:

Desktop 0.5.1 is a preview with the
[standard signing profile](deployment.md#desktop-signing-profiles). It is a
compatible patch that bundles Runtime 0.3.1
([cats-runtime #93](https://github.com/cats-inc/cats-runtime/pull/93)):

- **Upgraded installations get current model menus again**
  ([cats-runtime #91](https://github.com/cats-inc/cats-runtime/pull/91)). Desktop
  builds from 2026-04-14 until the catalog cutover copied the factory catalog into
  the Runtime config directory. On upgrade, Runtime kept that copy as a personal
  override, so menus stayed old (for example Claude without Opus 5.5) or showed
  "Model catalog settings need attention". Runtime now backs up and removes an
  unmodified copy, or an untouched conversion of one, and uses the current factory.
  An edited file is kept as an operator override.
- **Muse effort starts at its first option** ([#143](https://github.com/cats-inc/cats-platform/pull/143)).
  The menu no longer offers a synthetic Default; it starts at `minimal` and submits
  it, matching the Muse picker policy and Playground.
- **Catalog refreshes.** Claude lists the ten explicit models from its current
  picker (including Opus 5, Fable 5, Opus 4.8, Opus 4.7, Opus 4.6 and Sonnet 4.6);
  Opus 5.5 now runs the picker's standard-context `opus`. Muse uses its CLI 1.4.0
  list.
- **Runtime fixes.** Claude sessions group by their recorded working directory, and
  native Windows Codex provider and Code Mode host launches no longer open windows.

Platform trust: macOS signed + notarized, Windows unsigned (no certificate),
Linux n/a.

Self-update into 0.5.1:

- Windows and Linux: installs of 0.4.3 through 0.5.0 self-update. 0.5.0 queries the
  feed on each check; an older install still uses its old update logic, so restart
  a Cats that has been open since before 0.5.1 shipped, then check.
- macOS: standard-profile installs such as 0.4.7 and 0.5.0 self-update, with the
  same restart advice for 0.4.x. A 0.4.6 install (unsigned override) cannot
  self-update; install the 0.5.1 DMG manually, once.

Migration steps:

The first Runtime start after the update retires an app-seeded catalog copy
automatically and keeps a byte-for-byte `.bak` beside it. A user-edited
`curated-model-catalogs.yaml` is not changed. No other data migration applies.

Platform and Desktop share version 0.5.1; the standard-profile preview is
published. Every OS bundles Runtime 0.3.1 from immutable commit
`e202eaf4037c648c73caa52c9a9d441793b2df71` and the existing
[Usage 0.4.0](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.4.0)
artifact with SHA-256 `7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.
npm `latest` now carries `@cats-inc/cats-platform@0.5.1`,
`@cats-inc/cats-runtime@0.3.1`, and launcher 0.2.0 under both
`@cats-inc/cats-one` and `cats-one`. The launcher requires Runtime `^0.3.1` and
Platform `^0.5.1`, so `npx cats-one@latest` resolves this release.

Deprecations:

None.

Release verification:

The [0.5.1 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.1)
was published from Platform `ba9417bb83170136cfc3c041f163ee4ec6c90099`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36184509729)
passed 7/7 jobs with `unsigned=false` (standard profile) and
`runtime_ref=e202eaf4037c648c73caa52c9a9d441793b2df71`; every OS build checked
out that Runtime commit. The workflow created the tag; it was never pushed first.

- Assets: all ten expected assets are present, and the release is a prerelease
  (not latest). The releases feed lists 0.5.1 first. All three public update
  metadata files name 0.5.1, with asset names and sizes that match the release.
- macOS: electron-builder signed `Cats.app` with the Developer ID certificate,
  notarization succeeded, and the workflow's verification step reported
  `source=Notarized Developer ID`. This was not re-verified from the published
  DMG, because the checking host runs Windows.
- Windows: the downloaded `Cats-0.5.1-setup-x64.exe` reports Authenticode
  `NotSigned`, which is expected without a certificate.
- Linux: n/a.

npm: [Runtime](https://github.com/cats-inc/cats-runtime/actions/runs/36183579493),
[Platform](https://github.com/cats-inc/cats-platform/actions/runs/36184505061) and
[cats-one](https://github.com/cats-inc/cats-one/actions/runs/36187020990) publish
workflows passed. The logs show publication with `latest` and signed provenance.
Registry entries and tarballs were available after propagation. A fresh-cache
`npx --yes cats-one@latest --platform-only --help` installed cats-one 0.2.0,
Platform 0.5.1 and Runtime 0.3.1.

## 2026-09-25 (0.5.0 preview, standard profile — publication)

Behavior change:

Desktop 0.5.0 is a preview with the
[standard signing profile](deployment.md#desktop-signing-profiles). It moves to
the next minor because it bundles Runtime 0.3.0
([cats-runtime #86](https://github.com/cats-inc/cats-runtime/pull/86)): release
execution no longer resumes retained contexts whose release compatibility cannot
be established ([cats-runtime #85](https://github.com/cats-inc/cats-runtime/pull/85)).
It also includes:

- **Update checks answer with the current feed** ([#140](https://github.com/cats-inc/cats-platform/pull/140)).
  Check for Updates queries the feed again even after an earlier offer or
  download, instead of redisplaying the remembered version, and a download
  re-validates the offer first and fetches the newest release. This takes effect
  once 0.5.0 is running.
- **Preview-only development content** ([#139](https://github.com/cats-inc/cats-platform/pull/139)).
  Desktop previews stage the Runtime preview supplement (Cats development,
  operation and practice skills); release-profile builds exclude it. The
  knowledge-practice tooling stays developer-only.
- **Usage App 0.4.0.** It declares Platform `^0.5.0`; its content equals Usage
  0.3.0, which declares `^0.4.0` and continues to serve Desktop 0.4.x.
- **Knowledge compatibility.** Catlas and Orchestrator bundled knowledge declares
  Platform `0.5.x`, preserving model guidance after the minor upgrade. Practice
  fixtures follow the checkout version. Cancellation tests fail promptly on
  unavailable knowledge, and CI has a bounded job duration.

Expected platform trust: macOS signed + notarized, Windows unsigned (no
certificate), Linux n/a.

Self-update into 0.5.0:

- Windows and Linux: installs of 0.4.3 through 0.4.7 self-update. The installed
  build still uses its old update logic, so restart a Cats that has been open
  since before 0.5.0 shipped, then check; otherwise it can offer the older
  version it found earlier.
- macOS: standard-profile installs such as 0.4.3, 0.4.5 and 0.4.7 self-update,
  with the same restart advice. A 0.4.6 install (unsigned override) cannot
  self-update; install the 0.5.0 DMG manually, once.

Migration steps:

No data migration: existing data is retained unchanged. After updating, a
conversation whose retained context cannot be verified for release compatibility
does not resume that context; release execution continues with a fresh verified
context.

Platform and Desktop share version 0.5.0; the standard-profile preview was
published on 2026-09-25 (recorded afterwards with 0.5.1). The
[0.5.0 prerelease](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.0)
comes from Platform `524e340667b2e4b2b76e8e87c2bbdbacf7b5ef53`. Its
[Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36151491375)
passed, and macOS reported `source=Notarized Developer ID`. It bundles Runtime 0.3.0
from immutable commit `e464619644ff499cc1dc7da03b755b91aa73d7b0` and the published
[Usage 0.4.0](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.4.0)
artifact with SHA-256 `7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.
No npm publication of Platform or Runtime is part of this release.

Deprecations:

None.

## 2026-09-25 (0.4.7 preview, standard profile — publication)

Behavior change:

Desktop 0.4.7 is a preview with the
[standard signing profile](deployment.md#desktop-signing-profiles). It restores
macOS self-update after the 0.4.6 unsigned override. Product content matches
0.4.6: no Platform product code, Runtime or App changes. The build takes the main
tip at dispatch; since 0.4.6 that adds only documentation and the reworded
`unsigned` workflow input description.

Platform trust: macOS signed + notarized, Windows unsigned (no certificate),
Linux n/a.

Self-update into 0.4.7:

- Windows and Linux: installs of 0.4.3, 0.4.5 and 0.4.6 self-update.
- macOS: standard-profile installs such as 0.4.3 and 0.4.5 self-update directly
  into 0.4.7, skipping 0.4.6. A 0.4.6 install (unsigned override) cannot
  self-update; install the 0.4.7 DMG manually, once.

Migration steps:

No data migration or dependency change. Existing setup remains valid.
Platform and Desktop share version 0.4.7; the standard-profile preview is
published. Every OS bundles Runtime 0.2.1 from immutable commit
`b712da2faf233c2ec9e4ecb831566a29f6effaa7` and the existing Usage 0.3.0 artifact
with SHA-256 `61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
No npm or new App publication is part of this release.

Deprecations:

None.

Release verification:

The [0.4.7 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.7)
was published from Platform `47f7f4eb212e5b17fe9b754634fea0f357adf3a8` (main tip at
dispatch). [Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/36098065565)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36098664846)
passed (7/7 jobs, `unsigned=false`, standard profile). The workflow created the
tag; it was never pushed first. All ten expected release assets are present as a
prerelease (not latest), the releases feed lists 0.4.7 first, and all three
public update metadata files name 0.4.7 with matching asset names and sizes.
Every OS build packaged Runtime `b712da2`.

Platform trust was checked on the published assets, not only in the workflow:

- macOS: the workflow reported `source=Notarized Developer ID`. In the published
  updater ZIP, both `Cats.app/Contents/MacOS/Cats` and `cats-stt-macos` carry a
  Developer ID Application signature for Team `97JBZ3MFX5` with the hardened
  runtime, and the stapled ticket is present.
- Windows: the downloaded x64 installer (144,666,125 bytes) is `NotSigned`, as
  expected without a certificate. Its SHA-512 equals the `latest.yml` value and
  its SHA-256 `b1440a25372d12123c3253b58b42241db78604290a1c9522c38dbf56e15baf2b`
  equals the GitHub asset digest.
- Linux: the arm64 `.deb` is unsigned by design.

No installed upgrade acceptance was performed in this check; that remains
pending on every OS, including the macOS 0.4.5 to 0.4.7 self-update.

## 2026-09-25 (Desktop signing profiles — correction for 0.4.5 and 0.4.6)

Behavior change:

No build or product behavior changes. Desktop signing now has named profiles,
defined in [Desktop signing profiles](deployment.md#desktop-signing-profiles).
This corrects the "signed preview" and "unsigned preview" wording in the 0.4.5
and 0.4.6 entries below:

- 0.4.5 used the **standard** profile, with the same platform trust as 0.3.6
  through 0.4.3: macOS signed + notarized, Windows unsigned (no certificate),
  Linux n/a. It did not differ from the previews before it.
- 0.4.6 used the **unsigned override** (`unsigned=true`). It differs from 0.4.5
  only on macOS, where the app is unsigned and not notarized. The 0.4.6 entry
  covers only that 0.4.6 itself cannot self-update; signed macOS installs also
  cannot self-update into 0.4.6.

Migration steps:

- Windows and Linux: installs of 0.4.3 or 0.4.5 self-update into 0.4.6 as usual.
- macOS installs of a standard-profile build such as 0.4.3 or 0.4.5:
  **Check for Update** reports 0.4.6 but fails with a signature error during
  download. Stay on the current build; it self-updates directly into the next
  standard-profile preview.
- macOS installs of 0.4.6: a manual DMG install needs a Gatekeeper bypass, and
  the result cannot self-update. Install the next standard-profile preview
  manually, once.

Deprecations:

The bare terms "signed preview" and "unsigned preview" are retired for new
records; use the profile name and each platform's trust instead.

## 2026-09-25 (0.4.6 unsigned preview — publication)

Behavior change:

Same release line as the 0.4.5 signed preview, republished unsigned per operator
request: the 0.4.4-prepared desktop automation skill updates plus Runtime 0.2.1
with the current provider model catalogs (including the Muse 1.3.0 refresh).
The build takes the main tip at dispatch, so unrelated main commits landed
after the 0.4.5 tag are included as ordinary preview content.
No new model mapping is added to Platform product code. Unsigned macOS
previews require manual installation and cannot self-update.

Migration steps:

No data migration or dependency change. Existing setup remains valid.
Platform and Desktop share version 0.4.6; the unsigned preview is published.
Every OS bundles Runtime 0.2.1 from immutable commit
`b712da2faf233c2ec9e4ecb831566a29f6effaa7` and the existing Usage 0.3.0 artifact
with SHA-256 `61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
No npm or new App publication is part of this release.

Deprecations:

None.

Release verification:

The [0.4.6 unsigned preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.6)
was published from Platform `540389f0db2b203a91db5b927729236e063555fb` (main tip at
dispatch). [Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/36092558793)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36093265795)
passed (7/7 jobs, `unsigned=true`). The workflow created the tag; it was never
pushed first. All ten expected release assets are present as a prerelease (not
latest), and all three public update metadata files name 0.4.6 with matching
asset names and sizes.

The downloaded Windows x64 installer (144,666,135 bytes) matches its update
metadata and API digest: SHA-512 equals the `latest.yml` value and SHA-256 is
`07815948a064939d01594271a319f0b0b623821ee0b93721a2568a84009e6bcc`.
Unsigned macOS previews require manual installation and cannot self-update.
No signature, package-extraction, or installed upgrade acceptance was performed
in this check; that remains pending.

## 2026-09-25 (0.4.5 preview — publication)

Behavior change:

Desktop 0.4.5 preview is the first publication carrying the 0.4.4-prepared
desktop automation skill updates (Windows Terminal text capture, window/pane/
focus guards, bounded keyboard handling). No new model mapping is added to
Platform product code. The bundled Runtime also brings the current provider
model catalogs, including the Muse 1.3.0 refresh. Version 0.4.4 was prepared
but never published; Desktop skips it.

Migration steps:

No data migration or dependency change. Existing setup remains valid.
Platform and Desktop share version 0.4.5; the preview is published.
Every OS bundles Runtime 0.2.1 from immutable commit
`b712da2faf233c2ec9e4ecb831566a29f6effaa7` and the existing Usage 0.3.0 artifact
with SHA-256 `61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
No npm or new App publication is part of this release.

Deprecations:

None.

Release verification:

The [0.4.5 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.5)
was published from Platform `cc5d07ad5614847ce71aae5ff8674e29d9d0a523` (main tip at
dispatch: the 0.4.5 preparation plus a later orchestrator commit).
[Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/36088332391)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36089195232)
passed (7/7 jobs, signed preview). The workflow created the tag; it was never
pushed first. All ten expected release assets are present as a prerelease (not
latest), and all three public update metadata files name 0.4.5 with matching
asset names and sizes.

The downloaded Windows x64 installer (144,612,036 bytes) matches its update
metadata: SHA-256 `8b85c28e2f6b47df61c832bf8aee8359bb33766b7896918d66f2559cb01c9aa1`
and the `latest.yml` SHA-512. No signature, package-extraction, or installed
upgrade acceptance was performed in this check; that remains pending.

## 2026-09-24 (0.4.4 — preparation)

Behavior change:

The canonical desktop automation skill now includes Windows Terminal text capture,
window/pane/focus guards and bounded keyboard handling, with native pilot evidence
and isolated guard tests. Runtime owns Codex menu traversal and catalog data; no
new model mapping is added to Platform product code. See the
[Windows Terminal pilot](research/2026-09-24-windows-terminal-catalog-pilot.md).

Migration steps:

No product API, persisted-data or App compatibility change. Platform and Desktop
share the prepared 0.4.4 version. This bump does not publish npm or a Desktop
preview; future Desktop publication must select an immutable Runtime source.

Deprecations:

None.

## 2026-09-24 (0.4.3 preview — publication)

Behavior change:

Cats Chat, Cats Work, and Cats Code shortcuts now survive normal Desktop restart
and shell refresh after setup. The old host used Node fetch without the window's
login session; the server correctly returned a minimal unauthenticated envelope,
which replaced the product list. Only setup completion previously synchronized
the authenticated renderer list, explaining why the shortcuts appeared sometimes.

The host now uses the window's Electron session, refreshes on login/logout, and
accepts shell updates from normal renderer loads and product changes. Confirmed
logout or product removal clears shortcuts; transient failures and stale responses
cannot erase a newer list. Ordinary synchronization preserves provider diagnostics.

Migration steps:

No data migration or dependency change. Existing setup remains valid.
Platform and Desktop share version 0.4.3; the preview is published.
Every OS bundles Runtime 0.2.0 from immutable commit
`edfec394951200702b9a88b4f9d76d97669b9be8` and the existing Usage 0.3.0 artifact
with SHA-256 `61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
No npm or new App publication is part of this release.

Linux ARM64 installed Desktop 0.4.2 → 0.4.3 automatic upgrade and tray acceptance
passed: the new package and native Desktop both report 0.4.3, and all three
shortcuts appear on automatic restart and survive renderer refresh. Linux
Electron 41.2.0 regression testing with a disposable profile also verified
persisted-login cold start, refresh, logout, and login again; it reproduced the
old transport returning no products.

Deprecations:

None.

Release verification:

The [0.4.3 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.3)
was published from Platform `ccfba1388374ef8913486acc5adc8fcd9645bca4`.
[Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/35912025735)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/35912123788)
passed. The tag resolves to that source commit. All ten expected release assets
are present, and all three public update metadata files name 0.4.3 with matching
asset names and sizes. Each OS verified the pinned Usage 0.3.0 artifact and offline
activation. Windows x64 is unsigned; macOS x64 passed signature, notarization,
stapled-ticket and Gatekeeper checks; Linux is ARM64 `.deb`.

The downloaded Linux package's SHA-512 matches its update metadata; SHA-256 is
`3dcf3dba94cafe3fec3f36265b6d2889121f3bc19d327d209dcc32d0c63dcc60`.
Read-only extraction confirmed package/Desktop/Platform 0.4.3, Runtime 0.2.0,
and the authenticated-session tray reader in the shipped host.

The [real Linux update acceptance](research/2026-09-23-linux-self-update-validation.md#2026-09-24-follow-up-released-042-to-043)
subsequently passed through the installed 0.4.2 updater and system authentication.
The old host exited with code 0; the automatic replacement preserved UID,
arguments and NoNewPrivs 0→0. All five current configuration files and normalized
model catalogs for all 16 providers remained unchanged; real model/effort menus
and Usage 0.3.0 remained available. No manual installation or source patch was
used. The source 0.4.2 was normally cold-launched to capture stdout before this
test; this does not claim an uninterrupted chain from the prior update. Windows
and macOS native update acceptance and a future update from 0.4.3 remain untested.

## 2026-09-24 (0.4.2 preview — publication)

Behavior change:

This version-only patch retains the implementation shipped in
0.4.1 and the subsequent [Linux investigation and native acceptance record](./research/2026-09-23-linux-self-update-validation.md).
It introduces no additional updater fix. Native 0.4.1 → 0.4.2 update acceptance
now passes; the diagnostic socket inheritance follow-up remains open.

Migration steps:

No new data migration or dependency change. Desktop 0.4.2 is published as a
preview; Runtime and App versions remain independently managed. Linux acceptance
confirmed the actual installed package and restarted Desktop at 0.4.2, preserved
settings/model choices and NoNewPrivs 0→0. A subsequent update initiated by the
automatically restarted 0.4.2 host still requires a future target.

Deprecations:

None.

Release verification:

The [0.4.2 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.2)
is published from Platform `92ada3ae2377d17b38f17486100677a07eee96ab`.
[Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/35893841114)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/35895597553)
passed. The release is a published GitHub prerelease with all ten expected assets;
all three update metadata files name version 0.4.2 and the matching installers.
Every OS bundled Runtime 0.2.0 from
`edfec394951200702b9a88b4f9d76d97669b9be8` and verified Usage 0.3.0 offline
activation. The Usage artifact remains pinned to SHA-256
`61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
Windows x64 is unsigned; macOS x64 passed signature, notarization, stapled-ticket
and Gatekeeper checks; Linux is ARM64 `.deb`. No npm or new App publication
occurred during publication.

Native Linux acceptance:

The installed, continuously running 0.4.1 updater completed 0.4.1 → 0.4.2 after
normal system authentication. The package and native Desktop dialog both
reported 0.4.2; the automatic replacement preserved UID, arguments and
NoNewPrivs 0→0 without a cold launch. Runtime 0.2.0 and Usage 0.3.0 remained
healthy/enabled. Seven configuration hashes, the existing migration backup and
all 16 providers' model API results were preserved; the actual model/effort
menus displayed their existing defaults. See the
[native acceptance record](./research/2026-09-23-linux-self-update-validation.md#2026-09-24-follow-up-released-041-to-042)
for timestamps, evidence and remaining gates. No manual Cats installation was
used.

## 2026-09-23 (0.4.1 preview — Linux Desktop update relaunch)

Behavior change:

Linux update/setup relaunch now preserves the host's existing privilege state.
Electron 41's native relaunch introduced NoNewPrivs and made a later `.deb`
update fail at pkexec with exit 127. The quit watchdog also starts after the
synchronous installer returns, so time spent authenticating does not cause a
successful install to be reported as a timed-out handoff. The Linux helper
preserves the existing UID, arguments and privilege restriction, waits for the
old host to exit, and retains DebUpdater's production HTTP executor.

Migration steps:

Existing restricted hosts still need a full Tray Quit and a normal cold launch;
the flag cannot be cleared in place. The source version's updater performs the
first upgrade to 0.4.1, so an automatic relaunch from 0.4.0 can still inherit the
old restriction. After installing 0.4.1, fully quit and launch normally once before
testing its repaired update/setup relaunch. Verify the actual package and running
Desktop versions; a downloaded update or host exit alone is not success.

The repaired host completed 0.4.1 → 0.4.2 with its automatic replacement preserving
NoNewPrivs=0; a subsequent update from that replacement remains pending.
Linux's official release-ready gate remains unchanged. Existing catalog upgrades
and settings must remain intact.
See the [Linux validation record](./research/2026-09-23-linux-self-update-validation.md).

Deprecations:

None. This compatible repair uses the next 0.4.x patch. Desktop bundles the same
Runtime 0.2.0 source (`edfec394951200702b9a88b4f9d76d97669b9be8`) and published
Usage 0.3.0 artifact as 0.4.0. Platform's npm version follows the shared manifest;
neither npm package is published. Source-fix CI passed before this release bump;
publication checks are recorded below, separately from native upgrade acceptance.

Release verification:

The [0.4.1 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.1)
is published from Platform `2a8a58ff9d8a77d0c912042c3950bad3019a5e0d`.
[Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/35883051347)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/35883097624)
passed, including all three installers, Usage 0.3.0 offline activation, macOS
signature/notarization and validation of all ten assets. Every OS bundled the
Runtime commit above. Windows x64 is unsigned; macOS x64 is signed/notarized;
Linux is ARM64. No npm publication occurred.

On 2026-09-24 the Linux ARM64 installed updater completed 0.4.0 → 0.4.1 after
retrying an initial HTTP 500 and intermittent asset transfer. Both the package
and restarted Desktop reported 0.4.1; existing settings and model API results
were preserved. Following the required normal cold launch, the published
0.4.1 host's own relaunch preserved NoNewPrivs 0→0. The later 0.4.1 → 0.4.2
acceptance above validates that host's updater and automatic restart. The
validation record separately documents a temporary remote-debugging socket
inherited during that diagnostic
relaunch; the final normal launch omitted diagnostic arguments.

## 2026-09-23 (0.4.0 preview — existing catalog upgrades)

### Upgrade existing model settings before the first model request

Behavior change:

The preview bundles Runtime 0.2.0. On writable startup or explicit catalog reload,
Runtime validates and converts recognized schema-1 model settings to schema 2,
preserves their scopes/models/options, creates a unique raw backup and atomically
replaces the file. Current-format files and absent overrides need no migration.
Unknown mappings or write conflicts preserve the existing file and expose recovery
diagnostics. Compatible accepted settings remain usable when available.

Desktop model selectors stop indefinite loading for rejected catalog settings.
Runtime Setup & Repair shows upgrade details, the backup path and explicit retry
after correction. Successful retry refreshes the configured targets' model data.

Migration steps:

Install this preview over the previous Desktop version with the existing profile.
Recognized schema-1 catalogs upgrade automatically before model reads. Check the
model names, order, efforts and defaults, and restart to confirm no second backup
is created. If the profile was already manually converted, its schema-2 file stays
unchanged; use an isolated copy of the old backup to exercise conversion rather
than resetting the active profile. Setup & Repair reports any blocked conversion.
See the [catalog upgrade guide](https://github.com/cats-inc/cats-runtime/blob/main/docs/provider-catalog-soft-patches.md#existing-schema-1-files-and-rollback).

Deprecations:

The previously shipped schema-2 contract now uses the required 0.x minor release
boundary. Execution remains schema 2; migration is a bounded data conversion.
Runtime/Platform npm versions are prepared, with no npm publication in this task.
Usage 0.3.0 targets Desktop 0.4.x; the old Desktop 0.3.x App
artifact remains unchanged. Native installer upgrade acceptance is the purpose of
this preview and is separate from package and isolated-profile checks.

Release verification:

The [0.4.0 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.0)
is published from Platform `2874dd0eba8625c1a7086f65aea47dd2a63d60ac`, bundling
Runtime `edfec394951200702b9a88b4f9d76d97669b9be8` on every OS. Runtime and Platform
CI passed. The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/35862976809)
passed all three package builds, Usage 0.3.0 offline activation, macOS signature /
notarization checks and validation of all ten release assets. Windows x64 is
unsigned; macOS x64 is signed/notarized; Linux is arm64. This GitHub prerelease did
not publish either npm package. Linux ARM64 0.3.8 → 0.4.0 package/profile
acceptance passed on 2026-09-23, while exposing the relaunch/watchdog defects
described above. The repaired published update chain and other native upgrade
acceptance remain open.

## 2026-09-23 (0.3.8 preview — provider catalog data and local patches)

### Update one installation's model catalog without rebuilding

Behavior change:

Runtime 0.1.28 and Desktop now share the same validated catalog data for model
names, ordered controls, explicit defaults and fixed combinations. A local YAML
override replaces only its provider/backend/transport scope; other scopes inherit
factory data. Validation, digest-checked apply with backup, reload and rollback
are available through the Runtime catalog tool. Existing sessions retain their
recorded execution bindings. Desktop retains coherent observed menus during
temporary disconnections and never uses local informational labels to authorize
execution on a remote Runtime.

Migration steps:

An existing schema-1 `curated-model-catalogs.yaml` requires explicit conversion
to schema 2. The update does not rewrite personal files automatically. Before
using its model menus, use the new bundled Runtime's catalog tool to produce a
separate converted candidate, review it, then preview/apply and reload (or restart)
the same Runtime. Without valid schema-2 data or a compatible accepted snapshot,
the catalog reports unavailable. Clean profiles use factory data directly.
See the [catalog patch and conversion guide](https://github.com/cats-inc/cats-runtime/blob/main/docs/provider-catalog-soft-patches.md).

Deprecations:

Handwritten model/default/effort tables and schema-1 runtime loading are replaced
by the schema-2 data contract. The explicit converter retains evidenced legacy
mappings. Runtime and Platform npm versions are prepared only; this release
publishes Desktop preview assets and does not publish either npm package.

## 2026-09-23 (0.3.7 preview — macOS admitted to the release-ready gate)

### Recover from a rejected update download

Behavior change:

An update that downloaded but could not be installed no longer traps the
updater. Before this, a downloaded artifact could not be re-checked, a failed
install handoff returned to the same "ready to install" state, and the tray
flow showed nothing when the handoff failed -- so a rejected download was
offered on every click until Cats was restarted. Now a failed handoff is shown
once with its reason (a Squirrel.Mac signature rejection reads as "failed its
signature check" rather than "could not open the installer"), and the next
**Check for Update** re-checks first: a newer release supersedes the stale
download, and an unchanged one is offered again without re-downloading.

macOS passed the signed old-to-new self-update test (0.3.2 to 0.3.6) and is
admitted to `DESKTOP_RELEASE_READY_PLATFORMS`. This affects only official
builds, of which none exist yet; previews never went through that gate.

Migration steps:

From 0.3.6 on macOS, **Check for Update** downloads 0.3.7 and relaunches into
it; on Windows and Linux use **Check for Update** as usual. Anyone still on
the unsigned 0.3.3 DMG on macOS must install 0.3.7 manually once.

Deprecations: none.

## 2026-09-23 (0.3.6 preview — first signed macOS self-update candidate)

### Bring the update dialog to the foreground on macOS

Behavior change:

The tray-originated update dialog now activates the app before it opens. The
tray closes on click and the main window is usually hidden, so that message
box has no parent window, and macOS does not bring an app forward for a
parentless dialog: the "ready to install" prompt that follows a download opened
behind whatever was frontmost and went unseen until the next tray click.
Windows raises such a dialog on its own, which is why the two platforms looked
inconsistent.

Migration steps:

This is the first preview that can validate macOS self-update end to end.
0.3.3 was dispatched with `unsigned=true`, so Squirrel.Mac refused to apply it
over the signed 0.3.2 -- by design, as that release's notes stated; Windows and
Linux applied it because NSIS and dpkg do not verify signatures. From a signed
0.3.2 install, **Check for Update** should find 0.3.6, download it, and relaunch
into it. Anyone who installed the unsigned 0.3.3 DMG manually must install
0.3.6 manually once; self-update resumes from there.

0.3.4 and 0.3.5 were published to npm only; no desktop artifacts carry those
versions.

Deprecations: none.

## 2026-09-23 (0.3.4 npm alignment)

### Make the current Platform available to npm launchers

Behavior change:

Prepare the current Platform implementation for publication as
`@cats-inc/cats-platform@0.3.4` on npm's `latest` tag. cats-one 0.1.22 will require
Platform `^0.3.4` and Runtime `^0.1.25`, replacing its outdated dependency floor.
The existing setup and configuration ownership remains unchanged: preferences
are persisted when saved, the auth session secret is generated when needed,
and provider capability bootstrap rules remain opt-in.

Migration steps:

Publish Runtime and Platform first, then resolve cats-one's lockfile from npm
and publish the launcher. A fresh `npx @cats-inc/cats-one@latest` can then use
the aligned packages. Desktop installer publication is a separate workflow.

Deprecations: none.

## 2026-09-18 (0.3.3 unsigned preview)

### Let Cline accept short chat messages

Behavior change:

The bundled Runtime fixes Cline rejecting messages such as `晚安` or `hello`
as an unknown command before model execution. It also protects messages that
look like CLI subcommands or flags while retaining the selected provider,
model, effort and permission settings.

This preview is explicitly unsigned on all platforms at the operator's request.
The workflow now exposes an opt-in `unsigned` input for manual previews; the
default signing behavior from ADR-117 is unchanged for other runs.

Migration steps:

On Windows, use Cats Desktop **Check for Update**. Install the macOS DMG manually
for this unsigned preview; its update cannot be applied by Squirrel.Mac, including
from the signed 0.3.2 build. Linux users can install the published arm64 DEB.

The release uses Runtime commit `bf0c24880fb5045b4c2b0daaf27ce905f9b60b53`
(`0.1.24`, Runtime PR #69) and retains the locked Usage app `0.2.1`.
Dispatch `desktop-release.yml` with `tag=v0.3.3`, that exact `runtime_ref`, and
`unsigned=true`. Windows x64 NSIS, macOS x64 DMG/updater ZIP and Linux arm64
DEB remain the release artifact set.

Deprecations: none.

## 2026-09-18 (0.3.2 preview — first signed macOS preview)

### Sign and notarize macOS preview artifacts

Behavior change:

macOS preview artifacts are now signed with a Developer ID Application
certificate and notarized by Apple. A downloaded DMG installs without a
Gatekeeper bypass, and **Check for Update** works on macOS for the first time.
That was previously impossible rather than merely inconvenient: Squirrel.Mac
refuses to apply an update to an unsigned application, and macOS 15 removed the
right-click-to-open Gatekeeper bypass.

Per ADR-117 this changes artifact trust only. The build keeps its preview
release identity: it publishes as a GitHub prerelease, never becomes `latest`,
resolves to `preview_packaged`, and stays outside the release-ready platform
gate. Signing credentials are scoped per platform, so each platform starts
signing when its own certificate exists rather than waiting for the others.
Windows and Linux preview artifacts remain unsigned.

Migration steps:

**Existing macOS preview installs cannot update themselves into this release.**
Squirrel.Mac validates the signature of the *running* application before
applying an update, so the unsigned-to-signed transition is a discontinuity.
Download and install the 0.3.2 DMG manually, once; updates from 0.3.2 onward
work normally. This affects only that one transition.

On Windows, use Cats Desktop **Check for Update** as usual. Linux users can
install the published DEB.

Deprecations:

The `unsigned-preview-*` Actions artifact names are retired in favour of
`preview-*`, because a preview is no longer necessarily unsigned.

## 2026-09-18 (0.3.1 unsigned preview)

### Let first setup finish loading Catlas providers

Behavior change:

First setup can populate the Catlas provider/model picker when Runtime's initial
configuration response takes longer than 500 ms. Platform now waits within the
existing 5-second Runtime request deadline, retains the successful result and
reuses it on subsequent reads. Automatic retry and the spinner remain; no manual
recovery buttons or raw transport errors are added. Provider selection and
authentication checks retain their existing scope.

This preview also includes the separately merged ClinePass six-model shortlist
and its matching Runtime execution support. The merged macOS release target is
x64 again under ADR-117; preview artifacts remain unsigned.

Migration steps:

On Windows, use Cats Desktop **Check for Update** to install 0.3.1. Unsigned
macOS previews require downloading and installing the DMG manually; Squirrel.Mac
does not apply updates to an unsigned app. Linux users can install the published
DEB. A setup that could not finish can continue after the update; deleting local
Cats data is unnecessary.
Runtime remains 0.1.24, pinned to
`a44eb734279d5211f687d7dc3047d8207347c87c`. Usage remains 0.2.1 with the existing
immutable artifact and SHA-256 lock. Dispatch the manual Desktop workflow with
`tag=v0.3.1` and that exact `runtime_ref`. Windows x64 NSIS, macOS x64 DMG/updater
ZIP and Linux arm64 DEB publish after packaging and update-asset gates succeed.

Validation: the merged setup fix passed full CI (4,596 passed, 56 skipped,
0 failed). Read-only verification against the affected Runtime returned ten
providers in 1,497 ms cold and 23 ms warm. The paired ClinePass Platform and
Runtime commits passed their full CI. Version consistency and 47 focused release
version/asset checks passed. The version candidate requires its own
full CI plus the three-platform release workflow; verify the public update feed
after publication. Installed update/restart and setup acceptance remain with
the user.

Deprecations: none. This is an explicitly requested unsigned GitHub prerelease;
future version bumps still require a new request. The reported Devin model
execution issue is deferred and is not claimed as fixed by this release.

## 2026-09-18 (0.3.0 unsigned preview)

### Faster conversation switching and independent execution selections

Behavior change:

Previously opened conversations appear immediately from a bounded in-memory
cache while their subscriptions refresh in the background. Each conversation
retains its own provider/model/effort selection, draft, attachments and scroll
position. Delayed responses cannot switch the active conversation or overwrite
another conversation's draft. Interrupted subscriptions reconnect automatically.

This preview also includes the aligned Desktop Devin model presets, preservation
of custom model selections, and Runtime's Devin setup/model/Playground fixes.
The macOS installer and updater ZIP now use the merged universal build path.
The preview remains unsigned and does not use signing or notarization secrets.

Migration steps:

Use Cats Desktop **Check for Update** in an existing unsigned preview to install
0.3.0. Existing conversations, provider selections and user data do not require
a reset. Runtime remains 0.1.24, pinned to
`29ef46443c81d8d0e50944a052db882a18668376`. The bundled Usage App is 0.2.1,
which declares Platform 0.3.x compatibility with the same SDK 1.2 contract.
Its [immutable release](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.2.1)
comes from source `df1c57168c98a6a83fffb54f58ad298a1b769511`; the Desktop lock
pins its published SHA-256
`6b8160e548488f30c741cadd4726b55fa18f8c0a324d48ac0cbc6ea143788f24`.
Dispatch the manual Desktop workflow with `tag=v0.3.0` and that exact
`runtime_ref`. Windows x64 NSIS, macOS universal DMG/updater ZIP and Linux arm64
DEB publish only after all packaging and update-asset gates succeed.

Validation: the merged conversation-cache change passed full CI (4,588 tests,
56 skipped) and isolated renderer navigation checks. The pinned Runtime release
preflight passed. The version candidate requires full PR CI and the
three-platform unsigned release workflow. Verify public update discovery after
publication; the installed upgrade/restart remains user acceptance.

Release preparation passed 118 focused package/compatibility/release tests,
Desktop host and UI-test builds, plus independent compatibility review. Usage's
docs/tests/build release workflow passed; its downloaded digest, lock and
provenance agree. Platform fixtures use the current host version while explicit
incompatibility and caret-boundary tests retain their fixed assertions.

Deprecations: none. This remains an unsigned GitHub prerelease. This release
was explicitly requested; future version bumps still need a new request.

## 2026-09-18 (0.2.12 unsigned preview)

### Keep provider/model pickers available and recover automatically

Behavior change:

Chat, Settings and first setup's Catlas picker retain successful provider/model
data across tray idle and refresh failures. Initial loading and recovery use an
animated indicator with automatic retry. Raw timeout/auth messages, Retry and
Open Runtime Setup actions are removed from these pickers. Base and advanced
catalogs recover independently; confirmed selection/auth changes still clear
retained data. First setup also contains optional prefetch failures so recovery
does not leave an unhandled exception.

This preview includes the merged Copilot and Cursor fixed presets, OpenCode and
Kilo curated shortlists, and Runtime's corrected Muse effort menus. Existing
user-curated catalog overrides retain their normal precedence.

Migration steps:

Use Cats Desktop **Check for Update** in an existing unsigned preview to install
0.2.12. Provider selections and user data do not require a reset. Runtime remains
0.1.24, pinned to `03d3e1786b49de66b74b55a8c478db96f9721d6b`; the bundled Usage
App remains 0.2.0. Dispatch the manual Desktop workflow with `tag=v0.2.12` and
that exact `runtime_ref`. Windows x64 NSIS, macOS x64 DMG/updater ZIP and Linux
arm64 DEB publish only after all packaging and update-asset gates succeed.

Validation: provider recovery and first-setup regressions, isolated picker
visual checks, merged Platform CI and the pinned Runtime release preflight
passed. The version candidate requires full PR CI plus the three-platform
unsigned release workflow. Check public update discovery after publication;
the installed upgrade/restart remains user acceptance.

Deprecations: manual recovery actions inside provider/model pickers are removed.
This remains an unsigned GitHub prerelease. This release was explicitly
requested; future version bumps still need a new request.

## 2026-09-17 (0.2.11 unsigned preview)

### Restore Desktop onboarding cards and clean-machine preparation

Behavior change:

Desktop onboarding again uses its original classified cards and Show more,
with visible Node.js/npm preparation before any provider is selected. Node/npm,
npm prefix/PATH and GitHub CLI background checks run independently of provider
selection and retain their individual results. Installation remains explicit;
provider scans remain limited to the saved selection. Fresh helper checks find
newly installed commands and verify both Node and npm after installation.

Onboarding and Settings show short statuses and useful next actions, with
technical diagnostics and maintenance inside collapsed details. Checking one
tool no longer erases another tool's prerequisite status, including recovery.
This preview also includes the merged Grok 4.6/4.5 catalog and picker correction,
without inventing an upstream default marker.

Migration steps:

Use Cats Desktop **Check for Update** to install the 0.2.11 unsigned preview.
Existing provider selections and user data do not require a reset. Runtime
remains 0.1.24, pinned to `580f1c9be3a5158fb8967157900629062c9ea020`, with the
existing Usage 0.2.0 lock. The manual Desktop workflow uses `tag=v0.2.11` and
that exact `runtime_ref`; it publishes Windows x64, macOS x64 and Linux arm64
only after all release checks pass.

Validation: 98 focused cases, affected host/renderer builds and typechecks,
isolated onboarding/Settings browser checks, and independent review passed.
Required full PR CI and three-platform packaging/asset validation gate this
publication. Physical provider installation and sign-in remain user acceptance.

Deprecations: none. This remains an unsigned preview. The user explicitly
authorized this release; future version bumps still need a new request.

## 2026-09-17 (0.2.10 unsigned preview)

### Let first-run Catlas setup read provider catalogs before login

Behavior change:

The second setup step could show `Authentication is required.` and disable the
provider/model selectors even after Runtime setup was ready. The first Admin
session is created only at final submission, but the picker had called catalog
routes that required that session. The three catalog GET routes are now allowed
only during first setup; post-setup/repair requests and mutations retain their
authentication requirements. Runtime-selected scope still limits the results.

Migration steps:

Use **Check for Update** to install the 0.2.10 unsigned preview and reopen setup.
The fix requires no reset of provider selection or user data. Runtime remains
0.1.24 at `c1a5c0ae108a155b14867f85c344a23c9a95bdbf`, with the existing Usage
0.2.0 lock. The manual Desktop workflow uses `tag=v0.2.10` and that exact
`runtime_ref`; it publishes Windows x64, macOS x64 and Linux arm64 after all
release checks pass.

Validation: the original 401 was reproduced in an isolated HTTP test. The fix
passed 49 focused auth/setup cases and an actual browser flow through both
setup steps, provider/model selection, first-Admin creation and authenticated
catalog access. Anonymous access is denied again immediately after setup.

Deprecations: none. This remains an unsigned preview.

## 2026-09-16 (0.2.9 unsigned preview)

### Shared provider onboarding and Settings

Behavior change:

Desktop onboarding and Settings > Runtime now share the provider manager.
Checkboxes express the user's chosen scope and load the saved Runtime selection;
new installations start unchecked. Apply saves the selection and optionally
runs detection. Each selected provider supports its own Detect/Install actions,
with Upgrade/Repair/previewed Uninstall where supported. Prior detection results
remain visible after save-only changes. Ollama/OpenClaw expose endpoint editing
and explicit connection checks; command presence, sign-in and connection are
separate observations.

Saving an empty or partially ready scope completes Runtime bootstrap, so Desktop
can continue to product setup without opening another setup page. Progress stays
visible until the requested operation finishes. Installing a provider verifies
that target once, rather than scanning every selected provider.

Native Windows/macOS/Linux packaged scripts incorporate the reviewed
`environment-bootstrap` changes through `752dc13`: current-version gates,
Cursor/Kiro Windows paths, isolated vendor PowerShell, Devin sharing-lock retry,
bounded old-build cleanup, truthful observed changes, and verified npm updates.
An explicit npm-provider Upgrade also updates npm in its existing prefix; Apply
and Detect do not. Explicit custom prefixes are preserved.

Migration steps:

Use Cats Desktop **Check for Update** from an unsigned preview build. Existing
provider selections and detection history are retained; review them in Settings
> Runtime. This preview packages Runtime 0.1.24 at
`c1a5c0ae108a155b14867f85c344a23c9a95bdbf` (Runtime PR #54), with the existing
Usage 0.2.0 App lock. The
[unsigned preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.2.9)
was published by [run 35098915681](https://github.com/cats-inc/cats-platform/actions/runs/35098915681)
after Windows x64 NSIS, macOS x64 DMG/updater ZIP, Linux arm64 DEB, bundled-App
checks and update metadata validation passed. The public updater feed was
verified with the actual Desktop parser and resolves 0.2.9 on all three targets.

Deprecations: the separate Desktop provider editors and save-triggered global
scan path are replaced by the shared manager. WSL/Docker variants are outside
this native onboarding rollout. Physical native installation/login remains
user acceptance; automated validation uses isolated fixtures. This remains an
unsigned GitHub prerelease.

## 2026-09-16 (0.2.8 unsigned preview)

### Updated Claude/Codex catalogs and consistent defaults

Behavior change:

Claude Code 2.1.273 appears as four version-bearing choices: Opus 5 with 1M
context (default), Fable 5.1, Sonnet 5, and Haiku 4.5. The duplicate upstream
Default/Opus row is represented once. Opus, Fable, and Sonnet offer all six
observed effort levels with High as default; Haiku has no effort selector.
Desktop and Playground fallback lists now include Fable. Model/effort menus
standardize only the status marker to lowercase `(default)`, preserving the
model name's spelling and case.

The preview also includes the merged Codex 0.154.0 five-model catalog and
per-model effort defaults, Runtime's initial session discovery fixes, and the
new provider-selection bootstrap flow. Provider inventory and ordinary selectors
follow the provider targets selected in Runtime setup.

Migration steps:

Fully quit Cats and install the 0.2.8 preview normally. Desktop packages Runtime
0.1.23 at `46982a34d6964d2eee804fb60a4274ab382ea8ff` (Runtime PR #49); the existing
Usage 0.2.0 App lock remains unchanged. User-curated catalog overrides still take
precedence over the bundled example; this operator's Claude override was explicitly
approved and synchronized separately.

After both preparation PRs merge, dispatch the unsigned preview with `tag=v0.2.8`
and `runtime_ref=46982a34d6964d2eee804fb60a4274ab382ea8ff`. The workflow creates
the tag and publishes Windows
x64 NSIS, macOS x64 DMG/updater ZIP, and Linux arm64 DEB after all packaging and
asset-validation gates pass. npm packages use the existing `next` channel.

Deprecations: none. This remains an unsigned GitHub prerelease.

## 2026-09-16 (0.2.7 unsigned preview)

### Complete setup again after resetting all data

Behavior change:

Resetting all data now clears the previous local Admin, linked identities,
memberships, browser/mobile sessions, and login throttles alongside chat/core
setup state. Previously the remaining Admin made the second setup step fail
with `already_complete` when opening Cats, whether Catlas was enabled or skipped.
The reset confirmation now describes account and session removal.

Reset and setup completion share one serialized operation. Reset still requires
an authenticated Admin and CSRF token when an account remains but the setup
timestamp is missing. An auth-reset write rejection restores the previous
chat/core snapshot, and unexpected reset failures return a safe error message.

Migration steps:

Fully quit Cats and install the 0.2.7 preview normally. Upgrading does not itself
clear accounts: an installation already stuck after a reset on an older preview
needs another authenticated reset to remove its leftover Admin.

Desktop packages Runtime 0.1.22 at
`af2793ff6d50163efac65418d0deda7ff7f7eb9f`, with the existing locked Usage 0.2.0
archive. After merge, manually dispatch the Desktop release workflow with
`tag=v0.2.7` and that exact Runtime commit. The workflow creates the preview tag
and publishes Windows x64 NSIS, macOS x64 DMG/updater ZIP, and Linux arm64 DEB
only after all packaging and asset-validation gates pass.

Deprecations: none. This remains an unsigned GitHub prerelease.

## 2026-09-15 (0.2.6 unsigned preview)

### Passive provider detection at login

Desktop accepts installed, unverified provider targets as usable and preserves
their diagnostic warnings, matching the Runtime's shared passive detection policy.
The first-run Windows Ollama audit reads file version metadata without starting
the provider. Runtime background CLI/ACP checks and discovery no longer execute
providers to inspect versions, help, or session lists.

Desktop 0.2.6 packages Runtime 0.1.22 with the corresponding fix. The preview
workflow selects its exact merged Runtime commit. No migration or global
provider settings change is required. See the
[incident and validation record](../../cats-runtime/docs/research/2026-08-27-cline-self-update-and-probe-concurrency.md).

Deprecations: none.

## 2026-09-11 (0.2.5 unsigned preview)

### Multi-CLI quota queries and the separated runtime skill library

Behavior change:

Desktop selects the published Usage 0.2.0 archive with App SDK 1.2.0 and Runtime
commit `91bba98e2e621ec3124130b7c79fdc6c3ab7ca19`. The App lock pins SHA-256
`7d5455bb6b484b731becbc69b469e649fbfc433cf015586e0022c3045974c04e`
from Apps source commit `1affcf38e427f636e1eedb45bf3d1ac4e78eeb4f`.
Alongside Codex, Usage offers explicit Copilot, Claude Code and Antigravity
(`agy`) quota queries when Runtime advertises support. It preserves native
request quantities, unlimited entitlements, unknown values, stale observations
and independent provider/instance cooldowns. Opening or polling the dashboard
does not query accounts. Runtime invokes the configured native CLI only: no
credential extraction, Cats-originated provider API requests or model turns.

Kiro remains unenabled pending authenticated success evidence. Native Windows
CLI queries were live-verified; native macOS/Linux live queries and WSL/Docker
query transports remain unverified/unsupported respectively.

This preview includes the merged skill-root alignment: Desktop stages the
Runtime product library from `runtime-skills/`, not developer `skills/`.
cats-one's developer-workspace changes are merged but are not a Desktop sidecar.

Migration steps:

Fully quit Cats and install the 0.2.5 preview normally. The host activates the
bundled Usage update offline with no separate download, extraction or file move.
Settings, conversations and App data are retained, along with explicit disabled
or uninstalled App choices. This release task does not update the operator's
installed Desktop or modify its profile.

Deprecations:

None. This is an unsigned GitHub prerelease, not a signed stable distribution.
After this preparation merges, dispatch the Desktop release workflow with
`tag=v0.2.5` and the exact Runtime commit above. Let the workflow create its tag;
do not push a Desktop tag into the signed release path. The matrix is Windows
x64 (NSIS), macOS x64 (DMG/updater ZIP) and Linux arm64 (DEB). Each build must
verify actual bundled App bytes and temporary-profile offline activation before
publication. Those gates do not claim interactive native-installer acceptance.

## 2026-09-11 (0.2.4 unsigned preview)

### Explicit Codex quota refresh in bundled Usage

Behavior change:

Desktop bundles Usage 0.1.1 with App SDK 1.1 and Runtime commit
`603afdc2f9e46b31b56b0223f6a3f0690b5af76f`. The source-controlled App lock
pins the published archive's exact version, download URL and SHA-256.
Usage adds a Codex-only **Query latest quota / 查詢最新額度** button, showing
the provider's actual window duration, remaining percentage and reset time.
Opening the dashboard and its periodic snapshot refresh remain passive.

An explicit click uses the configured native Codex CLI's App Server stdio
`account/rateLimits/read` operation. Cats does not extract local CLI credentials
or issue its own provider HTTP request, and the query does not start a model
turn. Failed queries retain the last observation, and a 60-second cooldown
prevents repeated requests. WSL/Docker transports return unsupported; native
Windows was live-verified, while native macOS/Linux live validation remains open.

Migration steps:

Fully quit Cats and install the 0.2.4 preview normally. Desktop activates its
bundled Usage package offline; no separate App download, extraction or file move
is needed. Existing settings, conversations and App data are retained, as are
explicit disabled/uninstalled App choices. This release task does not update
the operator's installed Desktop automatically.

Deprecations:

None. This is an unsigned GitHub prerelease, not a signed stable distribution.
After this preparation is merged, manually dispatch the Desktop release workflow
with `tag=v0.2.4` and the exact Runtime commit above. Let that workflow create the
preview tag; do not push a Desktop version tag into the signed release path.
The release matrix remains Windows x64 (NSIS), macOS x64 (DMG/updater ZIP), and
Linux arm64 (DEB). Each build must pass the actual-resource/offline-App verifier
before publication; these checks are not interactive native-installer acceptance.

## 2026-09-10 (0.2.3 unsigned preview)

### App renderer loading recovery

Behavior change:

Fix the Windows single-file sidecar's SDK resource lookup by preserving its
package import during bundling. Version 0.2.2 inlined that module, making a valid
installed Usage archive fail to render with HTTP 503 because the SDK was read
from the wrong directory. Add a production-bundler regression test and an
installer-resource gate for this exact failure.

App startup now has a 15-second renderer/SDK deadline and a localized retry button.
Failed initialization and late responses from disposed attempts cannot leave a
permanent loading placeholder or replace a newer attempt. This is a host change;
no Usage package reinstall is required. Desktop still pins Usage 0.1.0 and the
same Runtime commit as 0.2.2.

Migration steps:

Fully quit Cats, then install the 0.2.3 preview over the existing installation.
Settings, conversations and App data remain in the existing user profile; do not
uninstall or delete that profile. No manual App extraction or file move is needed.
The published 0.2.2 installer is unchanged. Direct installed-window acceptance is
separate from the automated package and isolated browser/Electron checks.

Deprecations:

None. Merge this version bump before manually dispatching the Desktop release
workflow with tag `v0.2.3` and Runtime commit
`0345d319cf2f97ea51a482dd6932b34576a491b3`. Let the workflow create the preview
tag; do not push it directly into the signed stable release path.

## 2026-09-10 (0.2.2 unsigned preview)

### Usage is included as a version-pinned utility

Behavior change:

Desktop includes the independently released Usage 0.1.0 package selected by an
exact version, release asset URL and SHA-256. On first launch, Platform validates
and installs the bundled package offline, enables it and shows Usage in Lobby's
Apps section. Users do not separately download, move or extract the utility.
The packaged App/config/SDK roots now agree with Electron's resource layout.
Release jobs verify the actual unpacked resources and temporary-profile offline
activation on Windows, macOS and Linux before publishing the preview.

Usage reads the bundled Runtime's cached usage snapshot. Token/currency totals,
passive Claude/Codex quota reports, freshness and offline state are available;
active account polling and persistent usage history are not. Missing reports do
not mean zero usage or a full allowance.

Migration steps:

Install Desktop normally. Existing disabled/uninstalled App choices remain in
effect. No manual App migration is required. The release matrix is Windows x64
(NSIS), macOS x64 (DMG/updater ZIP), and Linux arm64 (DEB). Automated resource and
activation checks are not full interactive native-installer acceptance tests.

Deprecations:

None. This remains an unsigned prerelease, not a signed stable distribution.
Merge the version bump before manually dispatching the Desktop release workflow
with tag `v0.2.2` and the exact merged Runtime commit. Let the workflow create the
tag; pushing that tag directly selects the signed stable workflow instead.

## 2026-09-05 (0.2.1)

### Muse appears in the provider list without a relaunch

Behavior change:

The 0.2.0 preview left Meta Muse out of the desktop provider list on hosts that
had it installed. The bundled runtime inherited a PATH captured before the muse
installer ran — the installer writes its directory into the User PATH in the
registry, which no already-running process picks up — so it could not resolve
`muse`, reported it as degraded, and the desktop filtered it out.

The runtime bundled with 0.2.1 resolves a provider from the directory its own
installer uses when PATH cannot see it, so Muse shows up as ready immediately
after install. On Windows it also runs the recorded `muse-bin-<version>.exe`
directly instead of going through the `muse.cmd` launcher, which removes a
console flash on every launch from the desktop and roughly four seconds of
launcher startup from every probe and turn.

Migration steps:

None. If you installed Muse and did not see it, this build is the fix; no
relaunch or PATH change is needed.

Deprecations:

None.

## 2026-09-05

### Meta Muse joins the provider set and Aider is removed

Behavior change:

Meta's Muse CLI (`muse`) is now a fully supported provider. Packaged setup can
install, detect, upgrade, and uninstall it on Windows, macOS, and Linux, it
appears in the onboarding CLI grid, and it is selectable as an execution target
with model and reasoning-effort controls. Sessions run headless through
`muse exec --json` and resume with their history intact.

Aider is removed. It could be installed and detected but never executed, so it
was hidden from the onboarding grid and absent from the execution catalog. Its
installers, setup assets, and packaging entry are gone.

Two limits are worth knowing before selecting Muse:

- Muse reports no token usage at all, so metering and cost surfaces stay empty
  for this provider. This is a limit of the CLI, not of the integration.
- Muse exposes no per-tool allowlist, only three capability switches (writes,
  shell, web tools). A tool allowlist that names part of one of those groups is
  refused rather than silently widened to the whole group.

Migration steps:

If you use Aider through Cats, install it yourself from
https://aider.chat/install.sh; Cats no longer manages it. Nothing else changes
for existing providers.

To use Muse, install it from packaged setup and run `muse login` once. The
credential is stored in `~/.config/muse/auth.json`; there is no API-key
environment variable that substitutes for that account sign-in.

Deprecations:

Aider is removed rather than deprecated. The `aider` provider id no longer
resolves anywhere in setup, packaging, or the execution catalog.

## 2026-09-02

### Tray update checks refresh stale results

Behavior change:

Choosing **Check for Updates** from the system tray now performs a fresh
provider query after a prior `up_to_date` or `failed` result. Previously, a
long-running Desktop process replayed the earlier informational dialog, so a
release published after that check remained invisible from the tray even
though `Settings > Desktop > App updates` found it correctly.

Migration steps:

None.

Deprecations:

None.

### The legacy `/api/setup/complete` bootstrap route is removed

Behavior change:

`POST /api/setup/complete` — the original Chat-owned onboarding route that
created a Boss Cat and set `setupCompleteAt` — is removed. It could complete
setup without creating an Admin, which was a second bootstrap path around the
first-admin invariant added earlier the same day. `POST /api/platform/setup/complete`
is now the only setup-completion route, and it always creates the first local
Admin.

`POST /api/setup/reset` is unchanged and still used by Settings.

Deprecations:

The route, its renderer client (`completeSetup` in the shared and Chat renderer
setup APIs), and its pre-auth public-route exception are gone. `completeSetup`
had no caller left in the renderer.

Migration steps:

Anything still calling `POST /api/setup/complete` must move to
`POST /api/platform/setup/complete` and send `adminIdentifier` and
`adminPassword`. Two behavior differences matter: the platform route rejects a
`bossCatName` field because the Guide Cat name is system-managed, and it does
not create a Boss Cat. Assign one afterwards through `POST /api/cats` with
`makeBoss: true`, or `PATCH /api/cats/:id` with `makeBoss: true`.

### First Admin is always local, and Google is linked from Settings

Behavior change:

Setup now requires an Admin identifier and password. `/api/platform/setup/complete`
rejects a missing or partial pair with `400 invalid_admin_credentials` before it
writes any owner, Guide Cat, setup, or auth state, so a workspace can no longer
reach `setupCompleteAt` without a local Admin. During the promotion period an
Admin password must contain 8 to 256 Unicode code points; Cats applies no
uppercase/lowercase/digit/symbol rule and accepts spaces and password-manager
output. Length is counted in code points, so an emoji counts once.

First-admin creation is serialized and rechecks "no Admin exists" inside the
same auth-state write. Two concurrent submissions now produce exactly one
Admin; the loser receives `409 already_complete` and creates nothing. Auth
state is written before the chat/core snapshot and rolled back if that snapshot
fails.

`Settings > General > Account` now reports real login-method state and owns the
Google lifecycle. Linking or unlinking Google requires re-entering the local
password: the server issues a single-use action grant, valid for five minutes
and bound to the account, browser session, and purpose, which the browser sends
in `X-Cats-Auth-Action`. A stolen session and CSRF token are no longer enough
to attach a Google identity. A verified Google email must match the account
email; an account created with a non-email handle adopts the verified address
on its first successful link. Unlinking refuses to leave the account without a
local password, and on success revokes every other browser and mobile session
for that account while keeping the device that performed it signed in.

Ordinary Google login is unchanged in intent and stricter in practice: it
resolves only an already-linked Google `sub` and no longer rewrites the Cats
account email from the provider.

Deprecations:

`POST /api/auth/google/setup` — the standalone Google-only first-admin route —
is removed along with its renderer wrapper, domain helper, and public-route
exception. It had no supported setup UX. `/api/auth/google/link` and the new
`/api/auth/google/unlink` are protected routes now, not pre-auth ones.

Migration steps:

None for existing workspaces: an already-created Admin keeps working, and a
linked Google identity is unaffected. Operators automating first-run setup must
add `adminIdentifier` and `adminPassword` to their
`/api/platform/setup/complete` request body.

## 2026-08-05

### Desktop runtime setup opens in an authenticated system browser

Behavior change:

Desktop links to Cats Runtime setup, dashboard, and playground surfaces once
again open in the user's system browser instead of replacing the current
Electron page. Before opening the browser, the authenticated Desktop renderer
requests a 30-second, single-use handoff. The platform stores only its hash,
consumes it before issuing a separate HttpOnly browser session cookie, and
redirects to the allow-listed Runtime surface. Replays, expired handoffs,
non-Runtime return paths, and open redirects are rejected. The final Runtime
URL contains no handoff credential.

Migration steps:

None. The system browser receives its own Cats session the first time a
Desktop Runtime link is opened.

Deprecations:

None.

## 2026-08-04

### Every platform entrypoint provisions its first-run auth secret

Behavior change:

Clean `cats-platform`, `cats-one`, local dev, and packaged Desktop starts no
longer require an operator-created `.env` before the first-admin setup form can
complete. When no explicit `CATS_AUTH_SESSION_SECRET` is configured, the
platform server generates a 256-bit secret, persists it in the user-local
platform config directory, and reuses it across launches. Persistence uses an
atomic no-clobber publish so concurrent hosts converge on one value;
filesystems without hard-link support use an exclusive-copy fallback, while
permission errors remain fail-closed. Invalid files are quarantined and
regenerated, and stale temporary/invalid artifacts are cleaned during
provisioning. Direct CLI users receive an actionable path on stderr; Desktop
captures the same sidecar diagnostics and keeps real I/O failures on the
retryable bootstrap page. First-admin configuration failures use a safe
`503 configuration_error`, and unexpected pre-auth setup failures no longer
return raw exception messages, including failures caught by the server-level
request handler. Platform-launched project processes and shell helpers strip the
auth secret, runtime API key, Telegram credentials, and ngrok auth tokens from
their environments. The Windows installer smoke check honors custom
Desktop/platform data roots.

Migration steps:

None. Existing explicit secrets remain authoritative and are not overwritten.
Clustered or ephemeral deployments should configure their own shared
`CATS_AUTH_SESSION_SECRET`; single-host installs can keep the generated value.

Deprecations:

None.

### Desktop runtime setup links retain the authenticated app session

Behavior change:

Desktop links that open same-origin Cats surfaces in a new window, including
`/runtime/setup`, now navigate inside the authenticated Electron window. They
no longer open the system browser without the Desktop session cookie and fail
with `E_UNAUTHENTICATED`. Different-origin HTTP(S) links continue to use the
system browser, and unsupported URL schemes remain blocked.

Migration steps:

None.

Deprecations:

None.

## 2026-05-10

### Platform auth rollout in progress

Behavior change:

PLAN-089 server-side auth foundations now include the global route gate.
Browser local login/logout/status and Cats Mobile bearer login/logout/status
routes exist, setup-complete missing/corrupt auth state enters a constrained
repair path through `POST /api/auth/repair/first-admin`, and protected
Chat/Work/Code/Core/runtime/shell/transport APIs reject unauthenticated
requests before product dispatch. Setup-complete unauthenticated app-shell
reads return only the minimal setup/auth bootstrap envelope.

Migration steps:

Set `CATS_AUTH_SESSION_SECRET` before testing first-admin local login or mobile
bearer sessions. Keep `CATS_AUTH_ALLOWED_BROWSER_ORIGINS` explicit for every
trusted browser origin that may submit setup/login/repair/Google credential
POST requests.

Do not rely on `CATS_AUTH_ENABLED=false`; it is an unsafe dev/test escape hatch
and is rejected after `setupCompleteAt` exists. When an operator forgets the
only admin credential, delete only
`<platform-state-dir>/auth-state.local.json`, restart, and complete repair from
the one-time token written to
`<platform-state-dir>/auth-recovery-token.local.txt`. Deleting the auth state
file removes accounts, identities, memberships, and sessions, but leaves
product data intact.

Bounded aggregate login cooldowns no longer require auth-state deletion for
recovery. Operators can clear throttle state through the authenticated
admin+CSRF route or the one-time recovery token.

Cats Mobile now keeps Google login separate from browser GIS. The mobile
client discovers public mobile Google client ids from `/api/mobile/auth/status`,
starts a mobile OIDC flow, posts the resulting ID token to
`/api/mobile/auth/google/login`, and receives a mobile bearer token only after
the server verifies the token against `CATS_AUTH_GOOGLE_MOBILE_AUDIENCES` and
the per-attempt nonce.

Downstream tooling may key on these pinned error codes: `E_UNAUTHENTICATED`
for `401`, `E_FORBIDDEN` for plain authorization failures, and
`E_CSRF_MISMATCH` for Cats synchronizer CSRF failures.

Deprecations:

None in this slice.

## 2026-04-30

### Chat routing after ADR-091

Behavior change:

Existing non-direct participant chats changed routing behavior: a no-mention
user turn now enters the orchestrator first instead of auto-dispatching to
`defaultRecipientId`. Direct/private lanes still route unmentioned turns to the
direct participant, and explicit `@mention` routing is unchanged.

Migration steps:

Operators with older local rooms should mention the intended participant or
choose a per-turn audience when they want a specific Cat to answer first.

Deprecations:

None.
