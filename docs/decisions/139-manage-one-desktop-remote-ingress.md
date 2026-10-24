# ADR-139: Manage One Desktop Remote Ingress

## Status

Accepted product direction, 2026-10-24; provider/lifecycle completion and live
acceptance are not implemented by this documentation change.
[SPEC-130](../specs/SPEC-130-desktop-managed-remote-access.md) defines requirements;
[PLAN-122](../plans/PLAN-122-desktop-identity-and-remote-access-rollout.md) sequences delivery.
Implementation, credentials, provider-account changes, version bumps and
publication are outside this request.

Extends [ADR-125](125-own-multiple-frontends-and-backends-in-one-app.md)'s one-origin
boundary and [ADR-074](074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md).
For managed Desktop only, it replaces the operator-prepared-ingress expectation
in [ADR-029](029-automate-tunnel-and-telegram-webhook-registration.md).
Telegram polling remains the default; Apps still own their APIs, MCP and data.

## Context

Mobile, Telegram webhook bindings and external App MCP consumers need to reach
the user's Desktop. A per-App or per-bot public tunnel would duplicate account
setup and make removal of one consumer disrupt others.

The current code has a Platform-owned ingress, ngrok SDK worker, Desktop settings,
saved URL and restore-on-start. Its external provider assumes an operator already
runs a proxy. Tailscale Funnel has helper scripts but no equivalent managed
Desktop provider. Secrets currently persisted in ordinary ingress configuration,
limited connection states, and incomplete recovery need deliberate follow-through.
Existing local integration fixtures are not live Internet acceptance.

## Decision

### One setting and one shared public entry per profile

`Settings > Remote access` owns configuration for the Desktop profile.
Mobile pairing and each App show readiness or link to that setting.
They never collect a second tunnel credential.
The first stage serves Mobile's authenticated APIs/bootstrap, Telegram webhooks
and declared external App routes such as `/apps/cats.ask/mcp`.
Remote Web and a shared cloud authentication service are deferred under
[ADR-138](138-converge-google-and-password-admin-bootstrap.md).

Traffic terminates on the dedicated Platform ingress listener, not the internal
Platform/Runtime ports. Private component ports and internal host MCP remain
private. One enabled App/bot adds routes, not another public domain or tunnel.
App disable/remove revokes its routes without stopping the common connection.

### Providers have different setup requirements

| Method | Owner setup | Public name | Desktop responsibility |
| --- | --- | --- | --- |
| Managed ngrok | User's own ngrok authtoken | Obtain the account's assigned HTTPS name; an allowed custom/reserved name is advanced configuration | Start/monitor/stop its SDK worker |
| Managed Tailscale Funnel | Compatible installed client, user login and initial Funnel approval | Detect the device's `*.ts.net` HTTPS name | Inspect and manage only Cats-owned forwarding |
| Existing tunnel/proxy | Operator supplies public HTTPS origin and fixed unused target port | Operator's configured origin | Start/revoke Cats' listener; do not control the external proxy |

An ngrok API key is not required to run the tunnel. Tailscale auth keys are for
unattended device enrollment, not the normal Desktop connection form.
Cats guides an interactive login/approval when needed and must respect denied
policy or unavailable client support. Initial setup may require user action;
automatic startup reuses completed authorization.

### Desired state and observed availability are separate

Remote access defaults off. The user can connect/disconnect and choose automatic
connection with Cats startup. Saved enablement does not prove a live endpoint.
Desktop startup, resume and network recovery reconcile desired state in the
background with bounded retry/backoff; failure does not block local use.

Distinguish a provider connection, configuration needing action, and verified
public reachability. Preserve a usable stable origin across reconnects.
An origin change invalidates readiness until the consumer URLs and registrations
are reconciled. QR codes and Ask connection instructions use the current usable
origin; webhook-mode Telegram bindings register against that origin.

An ordinary window close that leaves Cats in the tray leaves the managed service
running. Disconnect or full application exit revokes public admission and stops
Cats-owned managed forwarding. Machine sleep means unavailable, not a promise of
cloud delivery. Unexpected crashes must leave the listener unavailable and be
reconciled safely on restart.

Tailscale background forwarding can persist across app/OS restarts. Cats records
its exact mapping/target ownership and checks the current daemon configuration
before reuse, replacement or removal. It never resets the user's entire Serve/
Funnel configuration, logs the user out, or takes over another service's mapping.
If clean ownership cannot be established, report a conflict and leave it intact.
External proxies remain operator-owned even when Cats is disconnected.

### Authentication belongs to the consumer boundary

- Mobile uses Cats-issued device bearer sessions.
- Telegram webhook requests use the binding's required webhook secret and
  durable duplicate handling; they do not require a browser login cookie.
- External App routes enforce their App connection credentials. Private App
  APIs retain scoped view grants and lifecycle revocation.
- Management and host-internal tools remain outside public admission.

Knowing the public URL never authenticates a caller. A valid tunnel credential
never grants a Cats account, App or Runtime permission. Google Desktop sign-in
uses its local callback and is independent of this connection.

Store managed tunnel secrets in OS-protected credential storage, scoped to the
profile; normal settings contain references, not plaintext copies. Upgrade the
existing JSON settings with validation, protected rollback material, atomic
replacement and failure/restart recovery before removing the old credential.
Neither App code, assistants, logs nor ordinary status APIs receive these secrets.

## Consequences

- A user configures remote access once, using their own provider account.
- ngrok and Funnel share a host lifecycle contract but retain distinct login,
  hostname, policy, OS-support and shutdown behavior.
- Public API/MCP requests cannot depend on an interactive browser challenge.
- Runtime peer ingress, remote Code previews and cloud hosting require their
  own scope; the shared listener does not automatically publish them.
- Delivery must validate provider behavior on supported packaged OS targets.
  A working local proxy fixture alone cannot establish provider availability.

## Alternatives Considered

- **Per-App or per-bot tunnels:** conflicts with the accepted shared-ingress
  model and duplicates setup/lifecycle.
- **Only operator-run scripts:** retained through existing-proxy mode, but does
  not deliver Desktop-managed connection/recovery.
- **One generic auth-key/domain form:** obscures Tailscale's client login and
  ngrok's authtoken/name allocation differences.
- **One Cats-owned provider account for all users:** adds centralized operation
  and tenancy obligations not authorized in this stage.

## References

- [SPEC-122: App components and private services](../specs/SPEC-122-app-components-and-private-services.md)
- [ngrok Node SDK](https://ngrok.github.io/ngrok-javascript/interfaces/Config.html)
- [ngrok domains](https://ngrok.com/docs/gateway/domains)
- [Tailscale Funnel requirements](https://tailscale.com/docs/features/tailscale-funnel)
- [Tailscale Funnel lifecycle](https://tailscale.com/docs/reference/tailscale-cli/funnel)
- [Tailscale identity](https://tailscale.com/docs/concepts/tailscale-identity)

*Last updated: 2026-10-25*
