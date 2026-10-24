# SPEC-130: Desktop-Managed Remote Access

## Metadata

| Field | Value |
| --- | --- |
| Status | Draft requirements; owner-confirmed product direction; completion not implemented |
| Date | 2026-10-24 |
| Decision | [ADR-139](../decisions/139-manage-one-desktop-remote-ingress.md) |
| Delivery | [PLAN-122](../plans/PLAN-122-desktop-identity-and-remote-access-rollout.md) |
| Authentication | [SPEC-129](SPEC-129-desktop-admin-bootstrap-and-google-sign-in.md) |

## Summary and baseline

One Desktop setting connects a profile's shared Platform ingress through managed
ngrok, managed Tailscale Funnel, or an existing operator-owned proxy. The first
stage supports Cats Mobile, Telegram webhook bindings and declared external App
endpoints, including Ask MCP.

Current code already provides shared routing, Desktop Remote access settings,
an ngrok SDK worker, saved URL/enablement and startup restore. Existing-proxy
mode requires a fixed port/origin. It does not start Tailscale. Provider recovery,
protected secret migration, bounded ownership and external acceptance are not
proved by those local fixtures. Extend this host; do not create another gateway.

## Scope

Remote Web product access/login and a cloud auth broker are deferred by the owner.
This is not an implementation of remote Code previews, Runtime peers, arbitrary
Runtime MCP/ACP, cloud App hosting, or a permanent cloud relay for sleeping hosts.
No new per-App tunnel or Ask-owned ngrok token configuration is introduced.
Existing explicitly configured LAN/Web deployments are not removed by this spec;
their compatibility does not imply a consumer remote-Web acceptance claim.

## UX and provider configuration

`Settings > Remote access` contains the main enable/disable control, connection
method, automatic connection with Cats startup, current status, public URL and
an explicit reconnect action. Mobile pairing and App connection instructions
read this shared status and link here. Configuration is managed from Desktop.
Diagnostics such as local port/process details are collapsed.

| Provider | Required setup | Domain behavior | Local target |
| --- | --- | --- | --- |
| ngrok | User's own authtoken; no ngrok API key | Prefer the account-assigned stable name; optional account-authorized name in advanced settings | OS-assigned dedicated ingress port |
| Tailscale Funnel | Compatible installed client, logged-in user, HTTPS/MagicDNS and Funnel permission | Discover the actual device/tailnet HTTPS origin; no arbitrary custom-domain text field | Stable reserved Cats-owned loopback target for persisted mapping |
| Existing tunnel | User-supplied HTTPS origin and unused fixed ingress port | Validate the exact configured origin | Cats listener only; operator runs the proxy |

Tailscale setup provides client detection, Install guidance, Sign in and Enable
Funnel actions as needed. Ordinary users do not paste an enrollment auth key.
Provider setup requiring browser approval or OS rights is surfaced as an explicit
user action. A daemon/client supporting private Tailscale access does not alone
establish Funnel support on that OS/install variant.

## Requirements

### Configuration, secrets and readiness

| ID | Requirement |
| --- | --- |
| REM-01 | Default remote access off. Enabling is explicit, profile-scoped and allowed only after authenticated setup. Local Google/password login works with remote access off. |
| REM-02 | Separate saved enabled/auto-connect intent from observed connection state. Auto-connect is visible when configuring; startup does not treat remembered intent as verified availability. |
| REM-03 | Only the local authenticated Desktop management boundary may change connection settings, secrets or provider forwarding. Public ingress, Apps and Mobile cannot grant themselves that authority. |
| REM-04 | Save provider secrets in OS-protected credential storage scoped to the Desktop profile, with references in normal configuration. Mask replacement fields and do not return stored secrets in status/read APIs. |
| REM-05 | Migrate current schema-2 inline authtokens and any relevant prototype settings using validation, protected backup, atomic replacement, failure recovery and restart idempotence. Reject unknown schemas and unresolved configurations without data loss. |
| REM-06 | Never silently fall back to plaintext storage when a secure store is unavailable. Report an actionable state; redacted export/support logs and backups cannot leak raw credentials. |
| REM-07 | Validate public HTTPS origins, ownership/provider permission and target bindability. Do not silently reuse an occupied port or an unrelated provider mapping. Scope every persisted binding to its profile. |
| REM-08 | Distinguish configured, provider-connected and publicly verified. Provider success without an independent external probe is not proof that Mobile/Telegram/MCP can reach Cats. |

Public verification uses an ephemeral, non-sensitive challenge bound to the
current ingress generation. Automated acceptance may use an independent test
client; this spec does not provision a Cats cloud probe service. Without such
evidence, report provider-connected/configured with public reachability unknown.
Never send owner tokens or private App data to third-party probe sites.

### Provider and application lifecycle

| ID | Requirement |
| --- | --- |
| REM-09 | Reconcile enabled/auto-connect settings after Platform readiness on startup. Check provider prerequisites in the background; retry transient failure with bounded timeout/backoff/jitter and one active attempt per generation. |
| REM-10 | Full application exit, disable, provider switch and reset revoke admission first, cancel in-flight connection/retry work and close Cats-owned workers/listeners/mappings. Late completions cannot resurrect an old generation. |
| REM-11 | Tray/background Cats continues serving; closing a window alone is not disconnect. Sleep/offline closes the availability claim, and wake/network restoration rechecks the actual endpoint before reporting readiness. |
| REM-12 | Managed ngrok owns only its SDK connection/worker. Reuse the stable allowed origin when possible; account rejection, domain conflicts and provider limits produce specific recoverable states. |
| REM-13 | Tailscale inspects daemon login, Funnel permission, endpoint/port occupancy and installation support before mutation. Open required first-time approval links; never silently bypass or broaden tailnet policy. |
| REM-14 | Record the exact Cats-owned Funnel mapping, public port, loopback target and profile identity. Inspect current configuration before resuming/removing it; never reset all Serve/Funnel mappings, log out Tailscale or replace another service. |
| REM-15 | Handle persisted/background Funnel state across app crash/OS reboot. Never point a stale persistent mapping at an arbitrary newly leased port; stable targets, reservation/ownership checks and ingress auth must prevent cross-service forwarding. |
| REM-16 | If ownership or cleanup cannot be confirmed, keep Cats admission off and report needs-action/cleanup-pending. Do not claim the external forwarding is stopped; preserve unrelated mappings. |
| REM-17 | Existing-proxy mode manages only Cats' target listener. Disconnect revokes Cats serving even if the operator's proxy remains online. Display that ownership distinction. |
| REM-18 | Separate targets for two Desktop profiles/installations. A domain or daemon mapping already in use is a conflict to resolve, not permission to pool independent accounts/data behind it. |

The lifecycle states must cover off, disconnected, connecting, connected,
retrying, needs-action, unavailable and cleanup-pending. Status additionally
reports public verification as unknown/passed/failed with observation time.
The wire schema and retry/timeout values are frozen in PLAN-122 P0.
Saving an invalid replacement must preserve the prior recoverable configuration.

### Routing and consumer authentication

| ID | Requirement |
| --- | --- |
| REM-19 | One public HTTPS origin/port/tunnel reaches the dedicated shared ingress. Do not tunnel normal Platform `8181` or Runtime `3110` as the managed target. Preserve canonical path/Host validation and untrusted forwarded-header stripping. |
| REM-20 | Freeze a public route/auth matrix by consumer. Deny internal host management, install/reset/credential operations, Runtime tool ingress and Code/Cat internal MCP. A generic `/api/*` proxy rule alone is not an exposure policy. |
| REM-21 | Mobile pairing/bootstrap may be public only as already defined; private product APIs/streams require valid Cats device sessions. A QR code contains connection/bootstrap information, never owner/tunnel tokens. |
| REM-22 | Telegram webhook dispatch uses binding-specific required secret verification, request limits and durable duplicate handling. It must reach that verifier without a Cats browser cookie/CSRF login gate. Unknown binding or wrong/missing secret is rejected. |
| REM-23 | Webhook-mode binding creation/reconnect, usable-origin change and host restart reconcile registration. Disable/removal/mode switch reconciles deletion as applicable. Failures remain visible; no automatic switch to polling. Polling stays the default without a tunnel dependency. |
| REM-24 | App external routes such as `/apps/cats.ask/mcp` retain App-owned authentication, request bounds and generation revocation. Mobile/browser sessions and App credentials are not interchangeable. |
| REM-25 | Private App API/view grants, opaque sandbox and clipboard/host capability boundaries remain SPEC-122 contracts. App removal revokes only that App; other Apps/Mobile and the shared connection continue. |
| REM-26 | Support actual MCP/streaming methods, headers, cancellation and proxy timeouts; no mandatory interactive login/interstitial or HTML response on machine-client routes. Verify the selected provider/account behavior. |
| REM-27 | A usable origin change regenerates pairing information, reconciles Telegram URLs and updates Ask connector instructions. External MCP clients may require the user to update/reconnect; do not claim to reconfigure them remotely. |
| REM-28 | Declared remote-Web scope is deferred. Classify any existing Web-facing routes in the public matrix and preserve their existing auth protections; tunnel presence must not expose unauthenticated setup or advertise new remote-Web/Google support. |

| Consumer | Intended public paths | Authority |
| --- | --- | --- |
| Mobile | Manifest/bundle/assets, mobile auth, required product APIs and streams | Bootstrap public where specified; Cats device bearer for private data |
| Telegram | `POST /api/transports/telegram/webhook/<bindingId>` | Binding webhook secret; no browser login |
| Ask / other Apps | Declared external routes, e.g. `/apps/cats.ask/mcp` | App connection credential |
| Google Desktop callback | None on the tunnel | Temporary local transaction from SPEC-129 |
| Desktop management / Runtime internal tools | None | Private host-only boundary |

### Compatibility and availability

| ID | Requirement |
| --- | --- |
| REM-29 | Reuse existing App mounts, Mobile sessions and polling behavior. Upgrading preserves disabled state, configured origins and existing consumer credentials; do not auto-enable remote access during migration. |
| REM-30 | Account-only Google bootstrap is sufficient authenticated setup readiness; do not require a local password merely to connect the tunnel. Preserve all caller authentication boundaries. |
| REM-31 | Host stop/sleep means no local execution or immediate answer reception. Preserve App/Telegram durable retry semantics and report known limits without promising cloud queuing. |
| REM-32 | Freeze settings/API/data compatibility before implementation. Breaking 0.x contracts require a minor boundary at an authorized release; no version bump or provider-account mutation is authorized by this document. |

## Acceptance scenarios

| ID | Evidence required |
| --- | --- |
| R1 | Fresh disabled profile makes no provider connection; both login methods work locally |
| R2 | ngrok with user's test account: discover/reuse HTTPS origin, restart/wake/reconnect, disconnect and worker cleanup |
| R3 | Funnel: detect login/permission needs, guide approval, persist/resume owned mapping and remove only it; unrelated Serve/Funnel service survives |
| R4 | Two profile/domain/port conflicts, app crash, persistent mapping, late connect result and provider switch cannot forward into another service or resurrect admission |
| R5 | Existing external proxy continues running after Cats disconnect, while Cats private APIs are unreachable through that target |
| R6 | One origin concurrently serves real Mobile, Telegram webhook and two App/MCP mounts with distinct credentials; one-App disable leaves others working |
| R7 | Missing/wrong webhook secret is rejected before work; valid webhook works without browser credentials and durable replay produces no duplicate work |
| R8 | Ask real external assistant read/submit matches request/receipt IDs; retained answer reopens locally; distinguish SDK preflight from Bot acceptance |
| R9 | Origin change updates QR/instructions and Telegram registration; old public authority is revoked, external-client action is reported honestly |
| R10 | Plaintext-setting migration, secure-store failure, atomic-write failure and restart retain recoverable credentials without leaking them |
| R11 | Public internal-tool/management denial, path/Host bypass attempts, expired/revoked credentials, streaming abort and timeout behavior |
| R12 | Packaged Windows/macOS/Linux provider support and cleanup are verified independently; local fixtures do not satisfy live provider or Mobile acceptance |

## References

- [SPEC-122: Existing shared App ingress](SPEC-122-app-components-and-private-services.md)
- [SPEC-028: Polling-first and webhook lifecycle](SPEC-028-automated-tunnel-and-telegram-webhook-lifecycle.md)
- [SPEC-099: Mobile pairing](SPEC-099-mobile-pairing-manifest-server.md)
- [Reference and provider documentation](../research/2026-09-01-credential-vault-admin-and-google-linking-reference.md#2026-10-24-follow-up-dual-bootstrap-and-managed-remote-access)

*Last updated: 2026-10-25*
