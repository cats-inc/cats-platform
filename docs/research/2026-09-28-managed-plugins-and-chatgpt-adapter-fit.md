# Managed Plugins and ChatGPT Adapter Fit

Date: 2026-09-28
Scope: preliminary document research and local Cats source inspection; upstream code was not run, installed or fully audited.

Follow-up: [C2C pinned feasibility evaluation](2026-09-28-c2c-plugin-fit-evaluation.md)
checks the exact revision's code entry points, host dependencies and the differences from the
managed lifecycle; the full workflow is deferred, and the bridge subset is listed separately
as an unselected candidate. The preliminary research below keeps its original scope and baseline.

## User direction

The user wants Plugins that can be installed and removed, beyond Runtime, Platform/Products
and Apps. A Plugin can bridge an external capability as a provider adapter, MCP, skills or
another restricted integration, visible and managed in Desktop settings. The general approach
is to reuse upstream and have Cats maintain a thin bridge, not rewrite the external core
functionality. Cats does not build in-house an integration that is a concern; existing
external repos can be listed as internal experiment candidates, and whether to test or release
is judged separately. MCP/skills the user installs themselves remain user-managed.

## The two repositories

The following are observations from reading default-branch documents that day; the upstream
commit was not pinned and release bytes were not verified, so they cannot be treated as
evidence of reproducible builds, compatibility or service permission. If one is chosen as a
pilot, the exact revision must be re-checked.

| Repo | Call direction described by the docs | Gap from a standalone Runtime provider |
| --- | --- | --- |
| [OpenChatX](https://github.com/XiaoPuOuO/openchatx-mcp) | ChatGPT calls local tools, other MCP, skills and agent capabilities through MCP/Tunnel | Provides tools to ChatGPT; it does not thereby give Cats an interface to proactively submit ChatGPT conversations |
| [C2C](https://github.com/XiaoDuoYa/codex-with-chatgpt) | Codex operates ChatGPT Web for planning/review; ChatGPT reads the workspace through read-only MCP | A standalone provider still lacks conversation control / result lifecycle independent of Codex; rebuilding this flow departs from the thin-bridge principle |

Sources: [OpenChatX README](https://github.com/XiaoPuOuO/openchatx-mcp/blob/main/README.md),
[C2C architecture](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/architecture.md).
This is a fit judgment based on the docs, not a quality rating of the repos, and does not rule
out upstream adding a usable entry point later.

The LICENSE of both main projects was MIT that day; keep their copyright/license notices, and
inventory bundled dependencies separately.
[OpenChatX LICENSE](https://github.com/XiaoPuOuO/openchatx-mcp/blob/main/LICENSE),
[C2C LICENSE](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/LICENSE).
MIT covers only code licensing; it does not provide permission for accounts or automation of a
third-party service.

## Service-interface distinction

The [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
documentation describes OpenAI products calling tools on a private MCP server and the server
returning results; this connection does not itself give an external program the ability to
proactively create a ChatGPT conversation. A tool service and a model/agent provider need
separate acceptance.

That day's [personal Terms of Use](https://openai.com/policies/terms-of-use/) (effective 2026-01-01)
restrict automated/programmatic extraction of data or Output, and circumventing service
restrictions; the [Services Agreement](https://openai.com/policies/services-agreement/)
(effective 2026-01-01) also restricts unpermitted data extraction and circumventing usage
limits. A web-automation adapter therefore needs a concrete interface and an interpretation of
the applicable terms; permission cannot be presumed from "official web page", "MIT" or
"internal testing, not released". This is risk research; it draws no breach-of-terms
conclusion about any specific repo, and does not block using documented, permitted service
interfaces.

## Local baseline

Platform worktree starting point `cbca3311`; Runtime local starting point
`3e47f46b3087e6a5543a59f0c69bf4327cd59533`. The following are read-only observations, not
results of new feature tests.

- [App package contract](../app-packages.md): renderer/SDK delivered; a general server/worker is not in the current packaging.
- [ADR-094](../decisions/094-adopt-cats-app-packages-as-extension-boundary.md) /
  [SPEC-098](../specs/SPEC-098-cats-app-package-and-extension-interface.md): once proposed one App covering
  many kinds of extensions; this does not mean a connector executor has been delivered.
- [SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md) /
  [PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md): a standalone App Market, full cleanup and recovery are still planned.
- [Runtime agent registry](../../../cats-runtime/src/backends/agent/adapters/registry.ts): a built-in switch
  selects OpenClaw, the Agent SDK bridge, or the ACP transport; there is no complete flow for dynamic loading from a managed Plugin inventory.
- [Runtime agent contract](../../../cats-runtime/src/backends/agent/types.ts): already has interfaces for turn invocation/events,
  probe, model/tool/session discovery, cancel/close and so on; optional capabilities must be reported truthfully.
- [Runtime architecture](../../../cats-runtime/docs/architecture.md): provider universe / machine detection /
  enabled config are separate; skills are delivered by Runtime and bound by release/preview policy.

## Recommendation

First design the source, install and capability-registration contract for managed Plugins,
reusing a suitable Runtime transport, and separately find an upstream pilot with a clear
license and a standalone machine entry point. OpenChatX / C2C are kept as cases for
recognizing direction, not as first-version dependencies or a commitment to ChatGPT provider
support.

- [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md)
- [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)
- [PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md)

*Last updated: 2026-09-28*
