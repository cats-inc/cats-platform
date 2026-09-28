# Agency managed Plugin pilot

This is an internal host integration, not a published Plugin SDK or marketplace.
The producer remains `cats-inc/cats-plugins`; its original Agency converter output,
upstream commit, MIT license, notices and provenance are retained. The host accepts
only Agency 0.1.0, SHA-256
`26afae3f0c5f551cc3bbce267c82d574963c4c2f94f48f9e8d3dcb0aa0ca07a5`.
The immutable preview manifest's integration-pending field is historical build
metadata; host policy and exact archive admission grant this one pilot integration.

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
