# ADR-122: Adopt Managed Plugins for Upstream Capabilities

## Status

2026-09-29: The user authorized continuing with Desktop install/remove and Runtime
integration. The Agency skills-only pilot below is adopted; the general Plugin SDK, provider
adapters, MCP, executable hooks and formal release remain out of scope. The host admits the
existing `cats-plugin-producer-preview/v1` artifact through its own fixed digest allowlist,
without changing the immutable bytes of 0.1.0, and does not treat its
`hostCompatibility.integration-pending` build description as a trust grant for arbitrary
packages.

Platform alone holds the package, intent and journal; Runtime protocol 1 holds observation,
the 30-second lease, the generation fence, durable session/native exposure and the CLI
lifetime receipt. Both sides explicitly enable the internal-experiment policy and use
separate data directories; Runtime must have a bearer key. The first version delivers
instructions only to natively, directly launched Codex/Claude and projects no user project
files. Disabling fences first, re-confirms newly added impact, then disconnects the affected
CLIs; only an actual child close and a closed owned Codex host count as stopped. Unconfirmed
receipts left over from a restart are kept as pending and not deleted automatically.
Platform also durably stores the conversation exposure, so that changing the Cat, skill or
new Runtime UUID does not automatically replay a conversation containing a revoked skill. A
brand-new conversation must be created; history can still be read.

For operation and limits see the [internal pilot guide](../managed-plugins-pilot.md). The
original proposal context is kept below; items beyond this pilot remain later design.

Proposed, 2026-09-28. The user confirmed the direction of reusing external capabilities,
making them installable and removable, and keeping internal experiments separate from formal
distribution, and asked for a worktree proposal. It was later authorized to create
`cats-plugins` with project-bootstrap, commit and push directly to main, and build the first
content-packaging MVP with Agency Agents. This authorization covers the foundation and
packaging verification of that repo; the full host protocol remains a proposal and does not
mean Desktop/Runtime integration or a product release has been delivered.

## Context

Cats needs existing capabilities from external repos to become optionally installable
members. Users can see, configure, disable and remove packages in Desktop, while
Platform/Runtime use their capabilities through explicit interfaces. A package can add an
independent provider execution target, or provide MCP tools or skills, without needing an
openable App main screen.

The App renderer, App SDK and managed packaging already exist; the independent App
Market/full lifecycle is still planned by
[ADR-121](121-distribute-apps-independently-with-host-owned-lifecycle.md). Runtime already
has CLI, API/local and external-agent boundaries, but the agent transport factory is still a
built-in selection, with no complete mechanism to dynamically register a new adapter after an
external Plugin is installed. See the
[research and current state](../research/2026-09-28-managed-plugins-and-chatgpt-adapter-fit.md).

The earlier [ADR-048](048-separate-platform-products-from-installable-apps.md) called every
distributable unit an App, and [ADR-094](094-adopt-cats-app-packages-as-extension-boundary.md)
further proposed App classes such as capability-connector. The new requirement makes it
necessary to separate "open an application" from "add a capability to the host" in the user
interface and the execution contract, but there is no reason to rebuild two sets of download,
source verification and update mechanisms.

## Decision

### 1. Plugins are manageable capability packages

| Concept | Responsibility |
| --- | --- |
| Runtime | The shared boundary for execution, providers, tools and skill delivery |
| Platform/Products | The Desktop host, management UI, and experiences such as Chat/Work/Code |
| Apps | Applications users open to get things done, for example Usage/Studio |
| Plugins | Optional capability packages used by Platform/Runtime; may have only a settings interface |

This is a fourth kind of deliverable member of the ecosystem, not a new mandatory layer
inserted between Platform and Runtime. cats-one still owns the development workspace and
launch orchestration and is not in these four product-capability categories. A Plugin is a
distribution unit; provider adapters, MCP/tool connectors and skills are contributions it can
provide. Having a settings UI does not automatically make a Plugin an App; and one package
need not correspond to one upstream repo.

### 2. Reuse upstream; Cats maintains a thin bridge

Prefer calling the CLI, API, MCP, SDK or agent protocol the upstream already provides. Cats
maintains packaging, version pinning, interface conversion, configuration and lifecycle, and
does not rewrite external core algorithms, agent loops or web-control flows into Cats-owned
versions. A necessary small patch needs a reason, tests and upstream tracking; if integration
would require rebuilding a major feature, choose the candidate again.

It is suggested that `cats-plugins` later maintain integration recipes, thin bridges,
source/license evidence and versioned artifacts; upstream bytes may be bundled where the
license allows, or the user's existing services may be connected. The user has authorized
creating that repo and the Agency MVP; workspace composition syncs according to the cats-one
owner contract. The Plugin version and the upstream revision are recorded separately; a
user's machine cannot implicitly track upstream main.

#### Upstream source acquisition

By default `cats-plugins` maintains, per package, a source lock, build recipe, content
selection, necessary patches and notices; the source lock pins the repository URL, full
commit ID, source content checksum and dependencies. Even if upstream has no tag/release, a
commit can be selected and, once verified, published as an independent Cats Plugin version
and channel. A build worker fetches that source and produces an installable artifact;
Desktop needs no upstream Git checkout or build tools.

Submodules can be used in development scenarios that often need to read or modify upstream,
but they are not the Plugin distribution contract, and not every source is required to be
added as a submodule. When used, the gitlink must match the source lock, and CI does not
accept implicit updates that track a branch tip. A large or license-required vendored
snapshot may be chosen separately, still keeping the same source evidence. Source
archives/mirrors and artifact retention are managed by Cats; keeping only a URL that may
become inaccessible is not enough. For the concrete trade-offs and acceptance see SPEC-121
FR-10; currently the source/packaging MVP is authorized, and no product release is.

### 3. Shared package mechanisms, distinct execution boundaries

Apps and Plugins are clearly distinguished in UI classification, manifest kind and
validation, and reuse the applicable download, source verification, immutable artifact,
operation journal, data retention and recovery mechanisms. The shared parts are extracted
from concrete needs; the unimplemented App Market is not treated as a ready dependency, nor
is the delivered App renderer host rewritten for this.

The renderer restriction of the existing `.catsapp` is not relaxed by this proposal. The
exact format of the Plugin archive/manifest is fixed in P0; an App identity cannot be used to
load background programs, and a package cannot declare `system` privilege itself. The first
version uses a controlled catalog and explicit local installation, and does not open
arbitrary third-party submission or arbitrary in-host JavaScript loading.

### 4. Management lives in Platform; execution and capability registration in Runtime

Platform owns the Desktop Plugin inventory, install intent, compatibility checks, settings
and update UI. Runtime owns admission of execution capabilities, discovery, provider
selection, sessions, tools and skills. Platform delivers verified descriptions through a
versioned Runtime management contract; Runtime does not import Platform source. A single
install intent has only one writer, and Runtime reports actual observed/executed state,
without forming a second installer.

The first version lets external processes/services connect through already supported
versioned protocols, and any necessary Cats bridge also runs in a managed process.
Runtime's general transport client stays in Runtime; a new package need not rewrite the
built-in factory for each upstream, but a new protocol still requires explicit Runtime
contract work. Process separation by itself is not a full OS sandbox. A package must not
directly import private Runtime/Platform classes or arbitrarily operate the Core store.

Installed does not mean logged in, available or selected; a new provider must obey the
existing Runtime selection/readiness contract and does not replace Codex native or other
targets. Disabling immediately forbids new work and revokes registration, and the results of
stopping and cleanup are confirmed separately. MCP/skills/CLIs the user installed themselves
and external shared services are not taken over or deleted.

#### Host-owned lifecycle and optional hooks

First fix the manifest declaration, lifecycle protocol and host state machine, then provide a
small SDK/validator/fixtures. A skills-only Plugin has source registration, delivery and
revocation completed by the host, and is not required to write its own uninstaller. A package
needing special configuration or external-resource handling may declare limited hooks such as
pre/post-install and pre/post-uninstall; Platform orchestrates them and Runtime runs the
verified independent helper under the versioned protocol, with no arbitrary in-host loading.

Hooks return structured progress, completion evidence, failures and required actions; they
cannot modify the installer inventory, escalate privileges or terminate shared providers
themselves. Retry, timeout, crash recovery and external side effects are coordinated by the
operation journal; a failure is not treated as success, and atomic rollback across external
services is not assumed. Disable admission cannot be blocked by a failing hook.

The host is responsible for finding the affected work/sessions and presenting the operation's
impact. Removing skill files, disconnecting the CLI and restarting Desktop do not prove that
the model context has been cleared; reloading an old session/fork must still check the source
exposure. Prefer creating a clean context for the affected scope, and require restarting
owned services or Desktop only for a concrete host limitation. The full requirements and
acceptance are listed in SPEC-121 FR-09; the SDK helps implement the protocol and is not
another installer.

### 5. Internal experiments are separate from formal distribution

Experimental packages with a clear source may be installed in an isolated development
profile; experiments do not automatically enter the official catalog, Desktop preinstall,
stable or general preview. The host's build/profile policy decides whether to admit an
experimental artifact, and cannot just trust the channel the package fills in itself.
Upgrading or copying a profile also cannot promote an experimental source to an official one.

Source license, external-service terms, internal-test suitability and formal distribution are
each judged separately. MIT, a private repo, no release, or third-party author identity does
not automatically authorize service access. Cats does not build its own questionable ChatGPT
web adapter; existing external repos can be listed as research/test candidates, but existing
is no guarantee of being usable or publishable. OpenChatX/C2C is currently only a research
case, was not selected as a pilot, and there is no commitment to add a ChatGPT provider.

### 6. Relationship to existing decisions

If this ADR is adopted, it partially adjusts ADR-048's "everything installable is called an
App" and the public naming and execution ownership of capability-connector in
ADR-094/SPEC-098; Products, existing Apps, the App SDK and the delivered renderer contract
are kept. General Product-module extension remains deferred. Existing App data is not
renamed or moved automatically.

ADR-121/SPEC-120/PLAN-112 continue to own renderer Apps, and the new execution scope of
Plugins is planned by [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md) and
[PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md). Only after this proposal is
accepted are the necessary protocol/state contracts fixed in the Runtime owner repo; Platform
documents do not pretend Runtime already provides an API.

## Consequences

### Positive

- External project capabilities and upstream updates can be reused, reducing what Cats must
  maintain itself.
- Users can understand what was installed, who provides the capability, and how to stop and
  remove it.
- Providers, MCP and skills share package governance while keeping distinct execution and
  authorization semantics.

### Negative

- Cross-Platform/Runtime registration, revocation, crash recovery and version contracts are
  needed; store cards alone are not enough.
- Upstream compatibility, licensing and the update supply chain become continuing
  maintenance work; a thin bridge is not zero maintenance either.
- A managed native process usually has more permission than an App iframe, so it must be
  disclosed honestly and its admission scope limited.

### Neutral

- App Market and Plugin work can share foundations by milestone and need not be released at
  the same time.
- If a schema/API breaks an existing contract, bump minor/major according to each owner's
  version rules and provide a tested upgrade. This document does not bump versions, choose a
  release date, or mark unimplemented features as complete.

## Alternatives Considered

| Option | Trade-off |
| --- | --- |
| Call everything Apps and widen the App executor | Reuses the old term, but users can hardly tell applications from host capabilities; not recommended here |
| Add every external repo directly into Runtime core | Simple at first, but hard to make optional, update independently and remove later; keep only a general protocol client |
| Re-implement upstream features | Full control, but departs from the explicit direction of reusing external capabilities |
| Plugin and App each rebuild their own installer/catalog | Clear boundary but duplicated governance; share mechanisms, separate executors |
| v1 accepts arbitrary in-host programs and public submissions | Scope too large; start with controlled sources and limited contributions |

## References

- [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)
- [PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md)
- [External cases and terms research](../research/2026-09-28-managed-plugins-and-chatgpt-adapter-fit.md)
- [App Market contract](../specs/SPEC-120-app-market-and-lifecycle.md)
- [Runtime selection](115-bound-bootstrap-and-provider-choices-by-runtime-selection.md)
- [Current App packaging boundary](../app-packages.md)

*Last updated: 2026-09-28*
