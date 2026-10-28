# SPEC-121: Managed Plugin Capabilities

## Metadata

| Field | Value |
| --- | --- |
| Status | Agency instruction pilot delivered with full CI; general SDK remains proposed |
| Owner | Platform integration; Runtime execution contracts; cats-plugins Agency artifact |
| Reviewer | Product owner; cross-repo contract reviewer |
| Decision | [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md) |
| Plan | [PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md) |
| Baseline | Platform cbca3311; Runtime 3e47f46b; 2026-09-28 source inspection |

2026-09-29 execution scope: the Agency producer and the Platform/Runtime content pilot
below are delivered; full CI and isolated Candidate evidence are in PLAN-113. The general
lifecycle SDK, hooks, provider plugins, the public catalog and all ACs remain follow-up
work; there is no product release authorization.

## Summary

The 2026-09-29 pilot implements the following: local file inspect/install, a standalone
Settings Plugins tab, separate install and enable, explicit skill selection per Cat, impact
preview and confirmation, disable and remove, and restart reconciliation.
`GET /api/plugins` provides the inventory; the POST operations `inspect`, `install`,
`enable`, `impact`, `disable` and `uninstall` all pass a host policy gate, and mutations
use the inventory revision. Runtime protocol 1 registration/renew/fence/stop runs over an
authenticated local endpoint. Enabling requires verifying the same Runtime identity; an
expired generation is not revived automatically.
The new state namespace is schema 1; unknown or corrupt formats reject operations; existing
App and Cat storage schemas are unchanged.
The UI offers only the two Agency skill profiles that are currently registered with a valid
lease. Removal does not erase selections or history.
Companion is a Cat role and does not occupy a skill profile (ADR-124); a companion that has
an Agency skill selected keeps its companion identity, but Runtime accepts only managed
skills, so it does not also request the built-in companion skill.

This controlled pilot does not promise arbitrary archives, a remote Runtime, hooks, stable
SDK compatibility or market download.
An orphan receipt after a CLI crash needs operator recovery; no force-complete button is
provided until a stop has been verified.

Let users install external capabilities wrapped by Cats, manage them in Desktop
Settings/Market, and have Runtime or Platform consume the capabilities they declare.
Upstream keeps the functional implementation; Cats provides a thin bridge and a verifiable
lifecycle. Plugins are a new package kind; a provider adapter is only one kind of
contribution.

## Goals and user stories

- A user can see an installed Plugin's purpose, source, version, settings, health, and the
  result of stopping or removing it.
- After installing a Plugin with execution capability, Runtime can add a separate provider
  target, and the user explicitly selects it before submitting tasks.
- MCP/skills packages need not pretend to be a provider or to have a full App page.
- A developer can test an existing external implementation in an isolated profile and decide
  separately later whether to distribute it formally.

## Non-goals

Rewriting the upstream agent loop or core functionality; a Cats-built ChatGPT Web adapter
(which is a concern); arbitrary public submissions; payment and ratings; arbitrary in-host
code loading; a complete hostile native-code sandbox; Product modules; taking over MCP,
skills or CLIs that the user installed themselves. This phase also does not turn
Chat/Work/Code into packages, does not implement permanent cross-owner data deletion for
Apps, and does not require the first version to hot-load arbitrary new protocols.

## Existing implementation and gaps

| Item | Current state | This proposal |
| --- | --- | --- |
| App package | Verified renderer/SDK delivered; server/worker not generalized | Keep the limit; add a separate Plugin kind and validator |
| App Market | SPEC-120/PLAN-112 planned | Share applicable install governance; must not claim it already exists |
| Agent adapters | Built-in OpenClaw / Agent SDK bridge / ACP transport selection | A verified Plugin descriptor can register a separate target |
| Provider readiness | Runtime selection, probe and session contracts exist | Add Plugin provenance and revocation without bypassing existing rules |
| Skills | Runtime owns product skill delivery and preview policy | Add a managed source; keep the shipping/experimental and existing context boundaries |
| External repos | C2C deferred; Agency Agents statically evaluated as a skills-only candidate | P0 fixes a verifiable integration/delivery interface; neither pilot has been run |

## FR-01 — Package identity and source

A Plugin must have a stable ID, an independent version, kind, publisher, upstream
URL/revision, license and notices, artifact digest, supported OS/arch, host/Runtime/protocol
compatibility conditions and a capability declaration.
The Cats bridge revision and the upstream revision are separate, and the concrete build
recipe and any required patches are traceable.
The file format and version syntax are frozen in P0; all example names are proposals, not
existing endpoints or installable schemas.

The same version with different bytes cannot replace a published artifact; source
conversion and publisher/ID conflicts are handled explicitly. A signature proves the source;
it cannot grant `system` or undeclared capabilities. Package content does not directly modify
host/Runtime config files or run arbitrary install hooks; extra steps may use only the
operations declared under FR-09 and admitted by the host. Building upstream during
development and installing a verified artifact as a user are two separate flows; source
acquisition, and the case with no release, follow FR-10.

## FR-02 — Contribution and execution interfaces

| Contribution | Minimum semantics | Owner |
| --- | --- | --- |
| Provider/agent target | Can submit a turn, return events/results, recognize completion and failure, and declare capabilities such as continuation/cancel | Runtime |
| MCP/tools | Specifies transport, tool scope, auth reference and connection lifecycle; does not implicitly become a model provider | Runtime |
| Skills | Namespaced ID, source, dependent tools and delivery support; must not claim tools are installed through the prompt alone | Runtime |
| Settings/integration status | The host presents a settings schema, status and limited management actions | Platform |

One package can contain several kinds of contribution. In the first version, settings use a
host form/status and do not load an arbitrary Plugin renderer.
A background service is an execution resource of a capability; it must have an owning Plugin,
a purpose, start/stop and an access boundary, and it cannot obtain a general host shell just
by being installed. The first version does not open arbitrary Platform server routes or store
extensions.

Prefer connecting upstream through an existing Runtime protocol; when a small conversion is
needed, a separate-process Cats bridge provides a supported versioned protocol. Runtime does
not import JavaScript from an arbitrary download directory, and does not require each Plugin
to add its own hard-coded transport. Unsupported protocols are rejected explicitly and listed
as follow-up Runtime contract work.
An MCP server that only provides tools, or a skill that must be initiated by Codex, cannot be
disguised as a standalone ChatGPT provider.

## FR-03 — Verified registration and Runtime selection

Platform holds the install/enable intent and the artifact, and sends the full description
through an authenticated Runtime management contract.
Runtime verifies the source scope, host identity, compatible versions, permissions and
contribution collisions, binds the Plugin ID/version/digest/profile/activation generation,
and returns an observation of acceptance or rejection.
It must not scan an arbitrary Git checkout and run it automatically; manifest parsing and
inventory enumeration do not execute package code.

Registration and update must be idempotent and carry revision checks; a stale response must
not revive a disabled item. Cross-process transfer cannot assume shared absolute paths; v1
commits only to a Runtime managed by a same-machine Desktop. A standalone Runtime keeps an
input contract that does not depend on Platform source; remote or multi-host package
distribution is a separate case.

Install succeeded, Plugin enabled, registered, logged in, probe available and selected by the
user are different facts. A Plugin provider adds candidate targets; it does not automatically
change the existing default, ROI or model selection; before execution Runtime still verifies
the currently allowed targets. Capability metadata must not mark unsupported
streaming/resume/fork/cancel as true; reporting completion is not true streaming, and a local
abort of reception cannot pose as a remote cancel.
When diagnosis fails, keep the last observation with its source; when permission is revoked,
immediately forbid new execution, consistent with existing picker continuity.

## FR-04 — Package and execution lifecycle

Reuse the staged verification, operation journal, locks and pre-enable intent re-check that
apply from SPEC-120; the concrete shared code is still to be extracted. Record the desired
state, installed identity, Runtime observed state, operation revision and resources pending
stop or cleanup; a single enabled boolean cannot represent a cross-process stop.

| Operation | Verifiable result |
| --- | --- |
| Install | Verify artifact/dependencies/compatibility; if setup is incomplete, it can still show installed, pending setup, without posing as ready |
| Enable | Runtime accepts this generation's contributions; whether it can run follows existing selection |
| Disable | Reject new work, revoke tools/skills/provider admission, then request termination of the work this package owns |
| Remove | Disable first; after stop evidence is confirmed, clear the managed package/cache, retaining data and the removal intent |
| Update | Verify the new version, wait for active work to finish or let the user choose to stop it; switch generation and re-check permissions |
| Repair | Replace a damaged copy with trusted same-version bytes; keep settings, source and data |

In the first version, disable stops the Plugin's existing work and does not by default allow
it to continue to completion; when cancel is unsupported, Runtime is offline or the stop times
out, show "Disabled, stop pending confirmation" and do not clear bytes that may still be in
use.
Runtime terminates only the processes/sessions/subscriptions it created for this Plugin.
A Plugin skill/tool may also be in use by an existing user session: in that case what is
revoked is execution admission for the affected turn/context, the turn is cancelled under the
existing session contract, and if that cannot be confirmed it is marked pending; the shared
provider process or unrelated sessions are not terminated on that basis. Connecting to an
existing external service revokes only this Plugin's connection and requests; it does not
shut down the service or remove a global installation.

The journal and Runtime registration are reconciled before the host starts accepting work:
only stop/cleanup/query is retried, tasks are not resent, and a restart or bundle policy does
not revive a disabled or removed item. A new generation does not accept stale in-flight
responses. If Runtime did not receive a revocation, or after it loses contact, how admission
is stopped within a time limit must be fixed in P0 as a lease/reconciliation contract with
test bounds; execution rights cannot be maintained by an indefinitely cached enabled state.

## FR-05 — Permissions, dependencies and data ownership

Before install/enable, show the required file, network, process, provider and skill scope;
new permissions require re-confirmation.
Declarations are the basis for admission and disclosure; they cannot claim that a native
process is fully sandboxed; P0 lists the restrictions actually enforceable on each OS.
Secrets are stored only as references in the host credential store, supplied on demand to the
corresponding process/service, and are not written into an archive, manifest, ordinary log or
the renderer. A Plugin cannot obtain credentials of other packages or providers.

The first version supports private bundle dependencies and declared external prerequisites;
automatic installation of a Plugin dependency graph is deferred. When a prerequisite is
missing, explain it and reuse the host's explicit setup; do not implicitly run npm install or
curl shell. A shared process/tool is not terminated by removing one package; when a dependent
capability is lost, consumers show unavailable.

Installed content, cache, settings and user outputs are separate. Uninstall by default keeps
settings/outputs/history; data deletion is a separate case.
Delete files inside the managed root only according to the host ownership receipt, guard
against symlink/junction escape, and handle shared references, file locks and cleanup
pending. Manually installed MCP/skills/CLIs do not enter the managed registry and are not
adopted.
Skill projections produced by a Plugin need file ownership and collision checks, and must not
overwrite a user skill of the same name.

Skill text already sent into the model context cannot be recalled by deleting files. Disable
first forbids subsequent delivery, and for an in-flight turn carrying this provenance cancels
it or marks it stop-pending-confirmation per FR-04; this does not take ownership of that
session or the shared provider. A context containing revoked content cannot be claimed clean;
a clean context must be created under the existing session contract before it can run again.
Keep the release/preview skill admission rules; do not delete history to pose as a recall.
Closing the connection, stopping the CLI process or restarting Desktop is not evidence of a
clean context; if resume/fork/automatic recovery brings back the original content, it is
still bound by the same revocation rule. FR-09 defines the affected scope and operations the
host should present.

## FR-06 — Desktop settings and catalog

Settings provides a Plugins list and details, clearly categorized apart from Apps. It shows
purpose, publisher, version, capabilities, settings/connection status, permissions, and
install/enable-disable/update/repair/remove.
It shares the management service and does not copy the Apps installer.
The main screen does not force new Plugin App cards; provider targets are consumed through
Runtime's existing catalog/picker.
Settings operation feedback keeps using toasts; long-lived health and pending cleanup are
state, and technical diagnostics go in an expandable area.

First provide locally reviewable artifacts and a controlled catalog. A remote catalog follows
SPEC-120's principles of trusted source, signature, digest, compatibility and withdrawal,
and records the Plugin kind/version independently; the App catalog parser cannot be used
directly as an acceptor of executable Plugins. A complete catalog is not a precondition of
the local pilot; formal distribution must pass the source gate.

## FR-07 — Experiments and release

Local internal-experiment and curated release are explicit source policies, independent of
enabled/disabled and of version stable/prerelease. Experiments are admitted only in an
explicitly allowed isolated development build/profile; ordinary Desktop and ordinary preview
reject their registration, startup and skill delivery, even if the files were copied over.
This judgment is made by trusted host policy; editing the manifest cannot upgrade the
identity.

Research may begin with static reading and isolated fixtures; before actual outbound testing,
clarify the upstream used, the service interface and the license. Internal testing, MIT or
non-public release is not an exemption from terms of service. Formal catalog promotion must
bind the reviewed artifact/upstream revisions, license notices, the interface used and
verification results; an experiment passing is not carried over automatically.
This SPEC does not select a ChatGPT Web adapter and does not require Cats to implement its
web control or circumvention mechanisms.

## FR-08 — Compatibility and upgrade

The new Plugin registry and Runtime registration need a versioned schema/protocol; the Apps
registry and `.catsapp` v1 must not be silently reinterpreted as Plugins. An existing
capability-connector declaration is not an executable Plugin; keep it as is and provide an
explicit conversion plan, and do not start it automatically.

Prefer adding a separate data namespace. If shared installer extraction, Runtime config/API or
skill policy cause a breaking change, first record each owner's next 0.x minor (major for a
stable SDK) and the dependency order; do not assume it must share a version with PLAN-112 or
can unconditionally reuse its 0.6.0 plan.
A data-format upgrade needs validation, backup, atomic replacement, repeat-start and
failure-recovery tests; a code rollback must not read incompatible new data, nor discard new
outputs. This round does not change versions or persisted data.

## FR-09 — Lifecycle protocol, hooks and minimal SDK

### Declaration and execution split

The manifest declares contributions/dependencies/owned resources, data retention needs, and
optional lifecycle helpers with the permissions they need; a hook that does not exist is
handled by the host's default flow. Platform is the sole writer of the operation plan, user
intent, journal and inventory; Runtime provides impact/stop/delivery state and runs controlled
helpers. A helper does not import host modules, does not directly modify host config or
inventory, and does not judge context on Runtime's behalf.
Revocation of content-only packages such as Agency is done by the host's general skill policy
and usually needs no executable hooks.

The phases below are contract semantics; the concrete wire names/schema/timeouts are fixed in
P0, and this does not claim the SDK exists.

| Phase | Host guarantee and extra steps |
| --- | --- |
| Inspect/plan | Read-only check of compatibility, dependencies, resources, affected work/sessions and required operations, without running install programs. Items that cannot be observed are marked unknown, not inferred as having no impact |
| pre-install | Declared preparation steps run only after source/digest/path verification and staging; on failure the contributions are not enabled |
| Install/post-install | The host records the artifact and runs restricted setup/verification; if post fails, a recoverable "installed, setup incomplete" is kept and must not pose as ready. Login/enable/provider selection remain separate states |
| Disable/pre-uninstall | Once the removal intent is accepted, immediately block new admission and begin revocation; pre-uninstall means extra work before file cleanup, usable to release self-owned external registrations. A hook failure cannot block revocation or let the old capability keep accepting new work |
| Uninstall/post-uninstall | After coordinating the stop of affected work and confirming cleanup is allowed, remove the owned package/projections and run required follow-up verification or external wrap-up; until all required steps are confirmed, keep "removal pending" and a tombstone |
| Update/repair | Use the same operation contract, distinguishing old and new versions and generations; staging/switch/migration/recovery order is listed explicitly and no other script may bypass active-work and data protection |

The helper/protocol metadata needed by post-uninstall, and all required self-owned execution
dependencies, must be archived into a verified operation cache before the package is deleted,
and reclaimed only after wrap-up completes; this includes libraries, resources and a bundled
interpreter the helper references, not just the entrypoint.
Shared/external prerequisites are recorded separately as a version/location/readiness
contract, and their ownership is neither copied nor taken over; re-check before execution,
and a missing one means pending.
The cache no longer provides the Plugin's business capabilities. Files must not be cleared
only to discover that wrap-up cannot be recovered, and retry must not download a different
version of the hook/dependencies. When a required helper or dependency is damaged, the host
handles the known owned files, and external side effects that cannot be confirmed stay
pending/manual recovery and must not be falsely claimed as cleared.

### Hook I/O, failure and recovery

Each step carries the operation/step ID, Plugin identity/digest, phase, generation, deadline
and the resource/permission scope approved by the host. The helper entrypoint is fixed in the
verified artifact, execution arguments do not go through arbitrary shell string expansion;
process/network/credentials are restricted per FR-05, and out-of-process is not treated as a
full sandbox.

A response distinguishes at least succeeded, failed, pending and requires-action; it attaches
bounded progress/diagnostics, a receipt of completed side effects, retryability and the list
of required operations. Normal results, stdout and logs must not carry secrets.
Required operations can include creating a new session/context, restarting an owned service,
a Desktop restart with a concrete reason, or the user completing external setup; each carries
a target/scope/reason and a way to verify completion.
They can coexist, and restart is not a substitute for new-context. A helper only reports
needs; the host verifies and then presents them.

The host persists the step intent before execution, a step retries and dedupes safely under
the same ID, and writes a receipt on completion; exactly-once for external side effects is not
promised. If a helper already did something but the response was lost, reconcile/query first,
and if it cannot be confirmed stop at pending; a non-idempotent operation must not be blindly
rerun. A deadline/cancel also does not mean side effects were revoked.
List compensable steps, compensation failures and manual recovery; external accounts and
registrations are not assumed to be recoverable by a local rollback.
A hook must not make disable wait indefinitely or restore a generation by itself; whether an
update failure can roll back is decided by the compatibility of completed migrations and data.
P0 fixes the timeouts, retry budgets and step termination conditions for each kind.

### User operations and retained context

Before a removal with interrupting impact, Platform presents, based on Runtime's report, which
Cats/sessions are using the skill, which work needs to stop, and which old contexts can no
longer be continued afterward; the user can cancel this removal, or confirm to stop and
remove.
After the operation is accepted, Runtime establishes a fence at the same versioned admission
boundary and obtains an impact snapshot, blocking new work/delivery. Platform compares against
the confirmed scope; newly added interrupting impact needs supplementary confirmation; the
fence is held in the meantime and does not overstep to stop newly added affected work.
Cancelling at this stage does not automatically restore the capability, and clearly presents
the disabled state and the re-enable option.
When the stop state is unknown, keep "stop pending confirmation"; an authorization that
already covers the same impact can be reused without asking again.

Agency example: 2 conversations loaded the skill, 1 of which has an active turn; after
confirmation, new delivery is revoked, that turn is cancelled/confirmed, files that are safe
to remove are cleaned up, and both histories and the source exposure records are kept. Even
after the package is cleaned up, the old context must still not resume/fork into a runnable
state; guide the user to create a new context without the revoked content. History can still
be viewed, and the whole old skill cannot be replayed while claiming cleanliness. If a
Desktop restart restores an old session, it must be blocked likewise. Other sessions or the
shared CLI process must not be terminated because of this; manual installs are not brought
under management.

The SDK initially needs only manifest/protocol types, a validator, hook transport helpers and
lifecycle fixtures, including a content-only package example with no hooks. The wire protocol
is a cross-language contract and the SDK is an optional aid; the concrete package
name/owner is fixed in P0. Implement first the parts the pilot needs; the rest are not marked
as supported.

## FR-10 — Source and packaging when upstream has no release

`cats-plugins` recommends **source lock plus build recipe** as the default, with the fetch
performed only in an isolated build workspace of maintainers/CI. Each Plugin records the
upstream URL, full commit ID, selected source paths, source content hash/manifest,
license/notices, converter/bridge/patch revisions, build toolchain and dependency lock. This
describes the required information; lock file names and the full schema are not fixed here.

| Acquisition method | Positioning and requirements |
| --- | --- |
| Locked Git fetch / commit archive | Default; obtain by full commit and verify the source, outputting a separate artifact. A branch/tag is only for discovering candidates and must be resolved to a fixed revision before entering the lock |
| Submodule | Optional development method, suited to frequently reading/modifying upstream; the gitlink and lock must agree, and CI checks for a clean, exact checkout. A branch tip from submodule --remote cannot be used as release input |
| Vendored snapshot / licensed mirror | Use when source retention or offline need exists; attach the source, fixed revision, full notices and change diff, avoiding a hand-made fork with no provenance |

Whether the source has a release and whether Cats may publish a Plugin are different
questions. Agency can pin `479193dcce1cf6432ce0f5aa230ab8cc739a8c6b` as a candidate, and the
Cats Plugin then assigns a version and channel under its own compatibility rules; this SHA is
not an approved shipping version. The next upstream commit only becomes an update candidate,
and a new Cats artifact is produced only after diff/license/build/contract and pilot
verification; it does not automatically follow main.

If upstream contains submodules, LFS or external downloads, the recipe must state whether
each is needed, with its source and fixed revision or digest, and must not recursively pull
in unpinned content. A commit ID identifies the source; it does not mean the source is
trusted or the build reproducible; build inputs, toolchain, dependencies and the
corresponding verification must still be pinned. When a commit cannot be fetched, fail
explicitly and do not fall back to the latest version.

Keep the checked source snapshot/build receipt and the material required by the license, then
keep the immutable artifact published by Cats and its digest, so as not to depend solely on
the original repo continuing to exist. If the license does not allow the required
packaging/retention, use another integration method or change the candidate. Desktop installs
only verified Cats artifacts and does not require Git, upstream build tools, or running a
converter at install time. For a skills Plugin, the Markdown body is the required payload;
"does not depend on a source checkout" does not mean removing the instruction content to be
delivered or the source the license requires.

The [Git submodule documentation](https://git-scm.com/docs/gitsubmodules) explains that a
gitlink records the exact commit; the
[GitHub source archive documentation](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)
allows fetching a commit snapshot directly, and also notes that the compressed bytes may
change when an archive is regenerated.
Therefore source-content identity is kept separate from the downloaded-archive/Cats-artifact
digest: keep the reviewed archive bytes, or verify a pre-fixed file manifest/content hash; on
a digest mismatch, do not recompute and release directly. Before unpacking, still verify the
source and the archive path/size limits, and execute no content until unpack verification
completes.

## Acceptance matrix

| ID | Result that must be verified | Method |
| --- | --- | --- |
| AC-01 | A real upstream package is installed/configured/used through a thin bridge; source, revision and notices are traceable | Separate artifact of the selected pilot; install does not depend on the upstream checkout |
| AC-02 | A provider Plugin adds a separate target, submits a turn and returns a result; Codex does not run it on its behalf, and existing ROI is unchanged | Runtime contract plus a separate provider pilot; a mock is not evidence of real integration |
| AC-03 | MCP/skills are projected correctly and do not pose as a provider; a missing required tool is diagnosable | Contribution fixtures plus a real tool/skill pilot |
| AC-04 | Platform-to-Runtime registration is idempotent; collision / stale revision / wrong digest / incompatible are rejected | Boundary fixtures, restart/out-of-order tests |
| AC-05 | Disable blocks new work; unknown stop does not falsely claim success; cleanup does not disturb shared services | In-flight / disconnect / cancel unsupported / recovery |
| AC-06 | Uninstall really clears package/cache, data and manually installed items are kept, no path escape | Temporary filesystem on each OS / before-and-after digests |
| AC-07 | Update/repair is atomic, active work / revocation races and failures are recoverable | Operation journal fault injection |
| AC-08 | Skill revocation blocks new delivery; affected turns are cancelled/pending, residual context is not treated as clean, the shared provider and unrelated sessions are kept | Inject skill / provenance / release-preview admission into an existing session |
| AC-09 | internal-experiment cannot enter formal execution by copying a profile, changing a channel or restarting | Build/profile/Runtime startup cross matrix |
| AC-10 | Settings and catalog state agree, the provider picker does not bypass selection; errors have a next step | Isolated Desktop multi-window and Runtime fixture |
| AC-11 | Unmodified Apps run as usual; a schema change can upgrade/recover without automatically converting old connectors | Minimum supported host/App contract and migration |
| AC-12 | Release artifacts and catalog promotion have independent license/verification, experiments do not ship automatically | Artifact / catalog / Desktop bundle inventory |
| AC-13 | A hookless skills package uses the common lifecycle; with hooks they run in order, and post failure does not pose as ready/removed | Content-only plus controlled-helper fixtures, per-phase fault injection |
| AC-14 | Hook deadline / duplicate calls / lost responses / crash recovery do not repeat non-idempotent side effects; pre-uninstall failure does not block revocation, and the post helper can recover safely | Journal / receipts / compensation; restart after clearing the main package, verify missing cache execution dependencies and external prerequisites |
| AC-15 | Impact is visible and re-checked before removal; a CLI/Desktop restart or old-session resume/fork cannot clear exposure evidence, unrelated sessions are kept | Agency isolated multi-session, confirmed-scope race, new-context recovery and required-action UI |
| AC-16 | An upstream with no tag/release can still be built from a fixed commit; ref drift / gitlink mismatch / missing source / wrong hash are rejected, and install/recovery bytes do not depend on the original repo being online | Git / archive / mirror fixtures, sub-dependency / content normalization verification, offline install of a prepared artifact and before-and-after digests; does not claim external services can run offline |

The above is the full product acceptance scope. The completed subset and evidence for the
Agency content package are in PLAN-113; general hooks, providers, catalog, cross-OS and real
model acceptance remain to be delivered. All synthetic data uses an isolated profile /
temporary registry and does not touch the user's real data, logins or paid providers.

## Dependencies and open questions

- The shared lifecycle comes from the contract coordination in
  [SPEC-120](SPEC-120-app-market-and-lifecycle.md); implementation is yet to be delivered.
- The Runtime owner must record in P0 the exact changes to the protocol,
  registration/revocation, ROI and skill policy.
- [ ] Choose an upstream pilot with a license and a verifiable integration/delivery interface;
      provider and MCP/skill each have acceptance evidence.
- [ ] Fix the package envelope/manifest, protocol version, size/timeout/lease and OS support
      scope.
- [ ] Fix the lifecycle step/receipt/required-action schemas, the helper runner / minimal SDK
      owner and the hooks actually supported.
- [ ] Fix the source lock/recipe schema, source archiving / mirror retention and archive /
      content hash verification rules.
- [x] `cats-plugins` has been created and holds the Agency source lock, recipe and the fixed
      preview artifact; responsibility for catalog promotion / general Plugin release is
      still to be confirmed.
- [ ] If the permissions an external process needs cannot meet the admission policy, narrow
      the supported scope or replace the pilot.

*Last updated: 2026-09-29*
