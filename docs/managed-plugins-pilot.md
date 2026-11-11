# Agency managed Plugin pilot

This is an internal host integration, not a published Plugin SDK or marketplace.
The producer remains `cats-inc/cats-plugins`; its original Agency converter output,
upstream commit, MIT license, notices and provenance are retained. The host accepts
only Agency 0.1.0, SHA-256
`26afae3f0c5f551cc3bbce267c82d574963c4c2f94f48f9e8d3dcb0aa0ca07a5`.
The immutable preview manifest's integration-pending field is historical build
metadata; host policy and exact archive admission grant this one pilot integration.

## Installation and delivery boundaries (2026-11-11 audit)

Agency is optional and starts **not installed**, including in a policy-enabled
profile. Starting Desktop or polling the inventory must not install or enable it.
Package inclusion and installation are separate decisions: the owner permits a
future Standard preview to carry the archive without installing it. The current
0.15.1 preview staging does not include an Agency archive; its Settings card was
static catalog information, not evidence of installation. Release hosting remains
undecided. This audit does not change release pins or promote the internal pilot.

The Directory picker only offers skills from a live enabled installation. Cat
creation and profile updates enforce the same inventory check on the server;
knowing or retaining a `plugin:` ID cannot bypass installation or enablement.
An unavailable saved selection can still be cleared, and unrelated Cat edits
remain possible. Existing explicit installations are not silently removed.

The pilot supplies the selected Markdown body in that Runtime session's **user
message**, prefixed with `Instructions:` on each turn. It does not install a native
provider skill, register a system/developer message, or implement on-demand skill
discovery. No Agency files are written into the provider's global skills directory
or the conversation cwd. This avoids direct delivery to every Cat sharing that
cwd, but does not isolate files, shared transcripts or model-generated content.

Mixed group conversations are **not supported correctly**: the Platform exposure
receipt is keyed to the conversation. Once a managed Cat has used Agency, creation
or continuation of an ordinary Cat's session in that conversation is rejected by
the replay fence. The fence also protects against replay after disable; simply
removing it would break revocation. Per-participant delivery and conversation
history exposure need separate contracts before claiming general per-Cat group
support. Normal preview profiles still lack the experiment policy; installation
currently requires the isolated profile described below. Native skills, ordinary
preview installation and mixed groups remain further design/implementation work.

## Run an isolated source candidate

Prepare current dependencies in both worktrees, including Electron. From Platform:

```text
node scripts/desktop-candidate.mjs start --workspace . --runtime-root ../cats-runtime-plugin-integration --root ../candidate-plugin-01 --plugin-policy internal-experiment
```

The explicit option enables the pilot only in the new candidate and generates a
private `CATS_PLUGIN_MANAGEMENT_KEY`. Nothing is copied from the controlling user's profile.
Normal candidate launches strip inherited policy and credentials. For separately
launched developer hosts, explicitly set `CATS_PLUGIN_POLICY=internal-experiment`,
separate `CATS_PLATFORM_DIR` / `CATS_RUNTIME_DIR`, and the same nonempty
`CATS_PLUGIN_MANAGEMENT_KEY`. If the normal `CATS_RUNTIME_API_KEY` is configured,
both hosts must use that key instead. Remote Runtime endpoints are rejected.

1. Open Settings → Plugins. Select the `.catsplugin` produced by cats-plugins.
   Inspection verifies the complete immutable archive before ZIP decoding.
2. Install, then enable. Installation alone does not register or select skills.
3. In a Cat's skill settings choose Agency Code Reviewer or Agency UX Researcher.
   Start a new conversation with native Codex or Claude. A hot addition to an
   existing ordinary worker is rejected. Shell, WSL, Docker and peer execution
   are outside the pilot. No user project skill files are created.
4. Disable or remove. Review the affected Runtime session IDs and confirm.
   Changed impact requires another confirmation while the fence remains active.
   The UI retains pending state and package bytes while Runtime is unreachable
   or owned CLI processes have no verified close observation.
5. Start a new conversation after revocation. Reset, resume, fork, switching
   skills, Desktop restart and automatic transcript transplantation cannot erase
   the source exposure. Existing history remains available.

## State and failure behavior

Platform `plugins/state.json` is the only desired-state writer. Immutable archive
bytes live under its `plugins/packages` directory. Each mutation uses an inventory
revision; intents precede external effects. Runtime stores protocol-1 observations,
native/session exposure and CLI lifetime receipts in `.managed-plugins/state.json`
under its sessions directory. Both namespaces start at schema 1; no prior data
format is migrated. A dead writer lock is reclaimed only after verifying its PID
has exited, using a retained hard-link tombstone to serialize competing recovery.
Unverifiable locks and damaged state are preserved and fail closed.

Platform renews a 30-second Runtime lease every 10 seconds. Expiration fences new
work and requests closure of the affected CLI lifetimes. Runtime restart invalidates
leases and never replays model requests. Re-enabling requires an explicit action
and a new generation; old contexts remain fenced. Orphan lifetime receipts after a
crash need operator recovery. This pilot deliberately has no force-remove path that
would pretend a stored PID or a restart is proof of termination.

Runtime identities are pinned per Platform profile. A different Runtime cannot
acknowledge deletion of the old Runtime's capabilities. Built-in skills, manual
skills/MCP and unrelated package directories are not managed by this installer.

## Validation record

Focused automated checks cover exact archive admission, default-off policy,
install/enable separation, stale revisions, offline removal and restart intent,
new impact confirmation, conversation replay fencing, native rediscovery,
generation expiration, forged stop authorization, dead-writer recovery and actual
child close versus synthetic result/cancel. Candidate UI evidence and independent
review completion are recorded in PLAN-113 before delivery. No live model/account,
cross-OS runtime execution or installed-release acceptance is implied.

2026-11-11 availability follow-up: Platform's focused manager, Directory/Settings,
companion/profile and REST suites passed **47 tests**. Server compilation,
renderer typecheck, test bundling and typecheck of the changed TypeScript tests
passed. The all-test fixture typecheck reached unrelated missing mobile
dependencies (`expo-constants`, `@react-native-async-storage/async-storage`), so
it is not claimed as passing. Runtime's existing managed-plugin, prompt, Claude
and Codex suites passed **106 tests** in independent review. Additional isolated
probes verified no startup installation and no shared-cwd Agency files, and
reproduced the mixed-group rejection in both execution orders. The narrow fix
received independent code review; it does not repair that group limitation.
No data-format change, version bump, Desktop build/publication, live model call or
manual Desktop UI acceptance was performed.
