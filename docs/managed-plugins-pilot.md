# Agency managed Plugin pilot

This is an internal host integration, not a published Plugin SDK or marketplace.
The producer remains `cats-inc/cats-plugins`; its original Agency converter output,
upstream commit, MIT license, notices and provenance are retained. The host accepts
only Agency 0.1.0, SHA-256
`26afae3f0c5f551cc3bbce267c82d574963c4c2f94f48f9e8d3dcb0aa0ca07a5`.
The immutable preview manifest's integration-pending field is historical build
metadata; host policy and exact archive admission grant this one pilot integration.

## Optional preview installation (2026-11-11)

Agency starts **not installed**, including in a policy-enabled profile. Starting
Desktop or polling inventory never installs it. Preview packaging carries the
production archive from `vendor/` using `config/desktop-plugins.lock.json`; release
content excludes it. The host validates the bundled bytes and passes the
`desktop-preview` policy and a private management key to both local sidecars.
This content choice is separate from Standard/developer signing. Downloading
Plugins from GitHub Releases remains undecided.

1. On a clean preview profile, Settings → Plugins offers **Install** without a
   file picker. Directory Cat settings show no Agency names or saved-selection
   hints before installation.
2. Install verifies the immutable archive, saves it and registers the two skills
   with Runtime. It does not assign skills to any Cat.
3. For a native Codex or Claude Cat, select Agency Code Reviewer or Agency UX
   Researcher in Directory. Selecting the active skill again clears it. Start a
   new conversation to use the changed selection. Unsupported providers cannot
   select Agency, including through the Cat API.
4. Settings Disable/Remove previews directly affected Runtime sessions and asks
   for confirmation. Changed impact requires fresh confirmation; unknown process
   lifetimes keep removal pending. Start a new conversation after revocation.

The selected Markdown is supplied in that Cat's Runtime **user message**,
prefixed with `Instructions:` on every turn. This is instruction delivery, not a
system/developer message or native on-demand skill discovery. No Agency files
are written into provider-global skills directories or the conversation cwd.
Ordinary group members can run before or after an Agency member without receiving
its overlay, including ordinary members using other providers. They can still
read shared history and skill-influenced output; this is not isolation of content.

After disable/remove, Platform blocks subsequent requests from the whole exposed
conversation, including a fresh Runtime UUID or cleared Cat selection. Runtime's
durable native exposure and stop receipts cover directly selected Agency sessions.
An ordinary group member already running may finish; it is not reported as a
directly managed process. Existing history remains readable. Explicit prior
installations are retained; the default-off change does not silently delete them.

The earlier 0.15.1 preview had only a static Settings catalog card, no bundled
installer; PR #437 fixed selection gating. The workflow above is the subsequent
preview packaging extension, not a claim that 0.15.1 already shipped it.

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
2. Install in Settings registers the package; the low-level install API still
   separates storing bytes from enablement for recovery. Neither selects Cat skills.
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
leases and never replays model requests. When the same enabled installation has
no pending CLI lifetimes, authenticated restore preserves its generation and
conversation exposure. Disabled/mismatched state, same-boot expiry and orphan
receipts cannot be restored. Explicit re-enable creates a new generation; old
contexts remain fenced. Orphan lifetime receipts after a
crash need operator recovery. This pilot deliberately has no force-remove path that
would pretend a stored PID or a restart is proof of termination.

Runtime identities are pinned per Platform profile. A different Runtime cannot
acknowledge deletion of the old Runtime's capabilities. Built-in skills, manual
skills/MCP and unrelated package directories are not managed by this installer.

## Validation scope and packaging dependency

Automated coverage includes pinned production preview/release staging, host
policy/key propagation, default-off inventory, the Settings Install action,
Directory visibility and toggling, Cat API availability/provider gates, mixed-group
admission in both execution orders, clean restart restore and rejected restores,
and the actual native Codex/Claude request payloads for both roles on successive
turns. Ordinary requests receive no Agency overlay; shared cwd stays unchanged.
Lifecycle tests retain offline removal, changed-impact confirmation, stale
revisions, generation fencing, damaged storage and verified process-close rules.
Detailed validation for this extension is recorded in PLAN-113 and Runtime
PLAN-044. Native Desktop UI acceptance is unavailable in this Mac environment;
component/API/packaging checks must not be described as manual installed UI checks.

The next Desktop source selection must include Runtime's desktop-preview policy
and restore extension alongside this Platform change. Keep exact source pins in
the new release preparation; do not amend a previously published release. There is
no data-format change or implicit version bump/publication in this implementation.
