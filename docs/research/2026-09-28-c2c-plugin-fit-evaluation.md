# C2C Managed Plugin Fit Evaluation

Date: 2026-09-28
Status: Static assessment complete; full workflow on hold; no pilot selected
Related: [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md),
[SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md),
[PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md)

## Result

C2C has a reusable read-only workspace bridge and a planning/review skill, but it is currently
not suitable as Cats' first end-to-end ChatGPT workflow Plugin, nor is it a standalone ChatGPT
provider. The main reason is that the control flow depends on browser capabilities provided by
the Codex host; that capability is not included in the C2C package, and Cats currently has no
corresponding contract. Packaging the files will not supply this dependency. If Cats built its
own ChatGPT web controller, it would exceed the thin-bridge scope.

| Evaluation target | This round's verdict | Reason |
| --- | --- | --- |
| A ChatGPT provider independent of Codex | Does not meet current candidate conditions | There is no upstream program entry point that can submit a model turn / obtain a result; the bridge's MCP is a workspace data plane |
| Using the C2C planning/review workflow in Cats | On hold, awaiting a usable host or upstream entry point | The skill depends on specific IAB APIs; managed update, session ownership and revoke also need adaptation |
| Wrapping only C2C's read-only workspace bridge | Conditional technical candidate, not selected as a pilot | Has CLI/HTTP entry points and a state-dir override, but only adds a workspace tool service and adds no ChatGPT inference capability; the product value must be confirmed first |

This is not a quality rating of the repo. **A skill-type Plugin need not always provide an
HTTP/CLI task API**: as long as Cats actually provides the host capabilities required and can
manage the skill's delivery and revocation, it can work. What is missing in this case is a
verified host dependency and integration path; "the development agent we are using has a browser
tool" cannot be taken as evidence that a Codex CLI / app-server launched by Cats has the same tool.

## Pinned evidence and method

| Component | Revision/scope |
| --- | --- |
| C2C | [`9663b88753e35c76796c5bce000293e0bd22cd9e`](https://github.com/XiaoDuoYa/codex-with-chatgpt/tree/9663b88753e35c76796c5bce000293e0bd22cd9e), package `0.1.3`; commit date 2026-09-13 |
| Platform | `55445aaffd0ce3a59ecea83ccefd3ca993318eb7`, already including Plugin proposal PR #160 |
| Runtime | `73f9def922e27e4b0bb3156db7a9b62026b22f5e`, read-only observation of a clean local checkout |
| Evaluation | `research/c2c-plugin-fit` branch, separate `cats-platform-c2c-evaluation` worktree |

Upstream was cloned into the workspace's `.research/codex-with-chatgpt`, with a detached checkout
at the SHA above, and we inspected the CLI handlers, HTTP routes, all MCP tool registrations,
session/process/storage, skill, package/lockfile and the related test sources. We did not run the
upstream CLI, install dependencies, build, run upstream tests, start services, log in to
ChatGPT, create a tunnel or modify user settings.
Below, "has" means an entry point exists in the source, and does not mean it passed actual host
acceptance or a full security audit.

## Actual capability flow

```text
Codex + upstream skill + host-provided IAB
  ├─ browser sends INIT / EXECUTED to ChatGPT and reads PLAN / DONE / BLOCKED
  ├─ Codex executes edits/tests with its own tools
  └─ C2C CLI saves checkpoints and nominated execution records

ChatGPT ── authenticated MCP ── C2C bridge ── read-only workspace / git / records
```

Upstream's [CLI handlers](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/cli/index.ts)
provide management commands such as serve/start/setup/stop/restart/status/doctor, pairing,
session, prefs, record and tunnel. The `session set` handler merges and writes local JSON; it
does not send ChatGPT messages, nor perform waiting/result parsing. The CLI has no ask / plan /
review task-call entry point.

The [Bridge HTTP routes](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/bridge/server.ts)
besides health, OAuth and `/mcp`, have only pairing/info/tunnel/revoke/shutdown management
operations. The [MCP server](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/mcp/server.ts)
registers nine read-only tools: workspace_info, list_directory, read_file, search_workspace,
git_status, git_diff, test_status, execution_summary, execution_output. There is no model
invocation or workspace write / shell execution tool; test_status / execution_output read
records and do not run tests for Codex.

The real ChatGPT control loop is in the
[skill's coding-task workflow](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/skill/SKILL.md#L512):
the agent sends messages through the browser, observes the DOM, reads back text and updates the
checkpoint. The protocol text and checkpoints help with reliable resumption, but they are not an
execution engine Runtime can call.

## Host compatibility gate

Upstream's [IAB contract](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/skill/SKILL.md#L101)
requires host capabilities such as `control-in-app-browser`, `setupBrowserRuntime()`,
`agent.browsers.get("iab")`, tab navigation / DOM interaction, visibility, and
`markHandoff()` / `markDeliverable()`. These are external capabilities the skill references, not
an npm dependency of C2C or a built-in browser implementation.

Cats' [browser driver contract](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/src/core/browser/driver.ts#L52)
provides session/page creation, navigation and closing; the existing
[Playwright driver](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/src/backends/browser/playwrightDriver.ts)
does not expose the IAB / DOM interaction contract above to providers. Searching Runtime `src`
and `runtime-skills` for the host API names above found no corresponding implementation. This
conclusion is limited to the Cats baseline inspected, and does not infer that all Codex products
or future hosts will not support it.

Even if the bridge is healthy and ChatGPT can read the workspace, that only proves the data plane
is connected. To claim a new provider, the Runtime
[invoke/events/cancel/close contract](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/src/backends/agent/types.ts#L280)
must still be met, and one cannot borrow the existing Codex execution skill to label it a
standalone ChatGPT adapter.

## Packaging and ownership findings

| Surface | Source evidence | Managed Plugin implication |
| --- | --- | --- |
| Build and dependency pin | The [package](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/package.json) declares Node ≥20, pnpm 11.24.0, TypeScript build; the [lockfile](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/pnpm-lock.yaml) pins SDK 1.30.0, Commander 14.0.3, Express 5.2.1, ignore 7.0.6, Zod 3.25.76 | A `latest` manifest does not mean it cannot be pinned; keep the commit, frozen lock, build toolchain and notices, and verify the artifact and OS separately. It has not been built, and it is not shown that the package can be distributed standalone |
| Upstream updates and skill install | The [Skill update workflow](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/skill/SKILL.md#L197) does a daily check, git pull/stash, install/build, copies the skill to the user directory and restarts | The original cannot be delivered as is. These operations must be handed back to the Cats installer, removing upstream self-update / global install through an explicit, traceable skill patch |
| Config writes | The [sandbox helper](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/config/sandbox-allow.ts) writes writable_roots in the Codex config; setup and doctor (which repairs by default) also call it | Changing only the skill is not enough. A managed wrapper cannot blindly use setup/doctor; it must avoid these side effects or have upstream provide a managed mode. `doctor --no-fix` is not a fully offline, side-effect-free guarantee |
| State ownership | [paths](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/config/paths.ts) supports `C2C_STATE_DIR`, writes JSON directly and chmods on a best-effort basis | Can isolate plugin instance state; cannot take over the user's existing C2C directory. Windows ACL, atomic recovery and upgrade still need verification |
| Process ownership | The [daemon](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/process/daemon.ts) start reuses or creates a detached child; the CLI has a hidden foreground `serve` | Having Runtime directly hold a foreground child can be evaluated. This is an upstream internal entry point, so it must be pinned / compatibility-tested and cannot be treated as a stable public API; cross-OS process tree cleanup is unverified |
| Stop evidence | stopBridge returns true right after the shutdown HTTP acknowledgment; on failure it sends SIGTERM to the PID in state without first checking that PID's process identity; the server shuts down asynchronously only after responding | A true return cannot be projected as stopped. The wrapper needs to keep its own started process handle and confirm exit; if it cannot confirm, pending, avoiding a stale PID fallback. Cancelling remote ChatGPT generation and closing the bridge are different capabilities |
| Session concurrency | The [session state](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/session/state.ts) holds one saved session / checkpoint JSON per workspace; project mode relies additionally on the agent thread to remember its own chat URL | It is not shown that several Cats sessions on the same workspace can run safely in parallel. A minimal pilot must limit to one active workflow and test resume / duplicate delivery; it cannot claim a task-isolated controller |
| Tunnel and credentials | [binary discovery](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/tunnel/detect.ts) supports `C2C_CLOUDFLARED_PATH`; [named provisioning](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/tunnel/named-provision.ts) can create a tunnel / DNS and reads the user's Cloudflare cert by default | A local bridge probe needs no tunnel. The outward-facing version must list the executable, account / DNS ownership and credential injection; `C2C_STATE_DIR` does not automatically isolate all external tool settings |
| Revocation and secrets | The [OAuth store](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/auth/store.ts) persists access / refresh token hashes; the [runtime state](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/bridge/runtime.ts) also contains a usable admin token. revoke-all can revoke OAuth / pairing | Do not describe all state as plaintext OAuth tokens; nor can one say the disk has absolutely no usable secret. Concrete alignment with the SPEC-121 credential reference policy is still needed. OAuth revoke does not mean existing model turns / skill context have been cancelled |

Permitted thin adaptation can include artifact pinning, settings / state paths, foreground
process supervision, health/error mapping and a bounded skill patch. Rebuilding ChatGPT login,
message sending, a DOM parser and a wait/recovery loop would be filling in a controller
upstream does not provide, and is not within the scope of Cats in-house development in this case.

## License and service gate

The pinned [LICENSE](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/LICENSE)
is MIT, and packaging must keep the copyright and license notices. The license / notice /
vulnerability inventory of the whole dependency tree and of the bytes actually bundled, such as
Node / cloudflared, is not complete, so release clearance cannot be claimed.

Code licensing and the ChatGPT service-use interface are judged separately. Following the
[earlier service-interface research](2026-09-28-managed-plugins-and-chatgpt-adapter-fit.md#service-interface-distinction):
this round draws no breach-of-terms conclusion about C2C, and adds no evidence of terms
permission. Internal-experiment identity does not settle whether the web-automation interface is
permitted; this round did not run this live path.

## Re-entry criteria and bounded experiment

The full workflow is re-evaluated only if one of the following paths holds:

1. Upstream provides a reusable task-control entry point that meets the service-use conditions,
   can submit planning/review, identify the task, obtain results and explicit failure, and
   truthfully represents cancel / resume capability; or
2. Cats confirms a compatible browser host that can be delivered to the actual provider session
   and controlled by the upstream skill, so Cats need not rewrite the ChatGPT browser loop;
   while also being able to restrict resource ownership, skill side effects and revocation.

Both paths still need to resolve the update / config / process / session / secret boundaries in
the table above, and confirm the applicability of the interface actually used. If bridge-only is
evaluated instead, the capability must first be named "providing read-only workspace tools"; which
product / external client consumes it, and its value compared with Cats' existing tools, must be
confirmed separately.

| Follow-up verification | Evidence that must be obtained | This round's status |
| --- | --- | --- |
| Isolated bridge probe | Fixture workspace, separate state, no tunnel; after build, started by a controlled child, MCP auth / read / out-of-bounds rejection, exit confirmation, no user-setting changes before and after | Not run; can only prove the bridge subset |
| Real workflow | A Cats session makes one planning / review request, upstream executes, and the result returns to the same Cats task; keep the task / instance mapping and the actual result | Not run; host / entry-point gate not passed |
| Failure and restart | Test bridge / tunnel / browser interruption separately; resume does not resend or redo completed changes; a timeout is not treated as success | Not run |
| Disable and uninstall | Reject new work, confirm owned process / tunnel ends; if cancel is impossible, pending / list the limits; handle the affected skill context, keeping manual installs and other sessions | Not run |
| Distribution | Fixed artifact, full notices / dependency inventory, per-OS verification and ordinary profiles rejecting internal-experiment | Not run, no release authorization |

This round did not skip structural gates just to obtain a "it ran" result. The static assessment
is enough to put the full C2C pilot on hold; the Plugin contract itself can still be evaluated
with another upstream that has a standalone entry point or a supported host. This conclusion
supplements P0 candidate evidence, does not change the proposal status of the ADR / SPEC, and
does not mean all of P0 is complete.

## Validation and resume

The CLI / HTTP / MCP direction of the pinned source, the browser host dependency and the lifecycle
differences have been checked. The results of the document diff / link check and of the
independent read-only review are recorded in PLAN-113.
The next step is to choose a new candidate under the re-entry criteria above, or to redefine the
bridge-only value; do not treat this research as an instruction to install C2C, connect the
user's ChatGPT account, or publish a Plugin.

*Last updated: 2026-09-28*
