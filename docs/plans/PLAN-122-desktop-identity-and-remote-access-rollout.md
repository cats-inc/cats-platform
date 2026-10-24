# PLAN-122: Desktop Identity and Remote Access Rollout

## Metadata

| Field | Value |
| --- | --- |
| Status | Draft; planning documents prepared; implementation not started |
| Owner | User |
| Date | 2026-10-24 |
| Identity | [ADR-138](../decisions/138-converge-google-and-password-admin-bootstrap.md), [SPEC-129](../specs/SPEC-129-desktop-admin-bootstrap-and-google-sign-in.md) |
| Remote access | [ADR-139](../decisions/139-manage-one-desktop-remote-ingress.md), [SPEC-130](../specs/SPEC-130-desktop-managed-remote-access.md) |

## Scope and authorization

The owner requested two ADRs, two specs and one integrated plan. The accepted
direction is dual Google/email-password Admin bootstrap, equivalent completed
accounts, Desktop-managed ngrok/Funnel and one entry for Mobile/Telegram/Apps.
Remote Web, including Google Web login and a central cloud authentication
service, is deferred. The owner additionally authorized direct commit/push of
documentation to main on 2026-10-25. Source implementation, account/provider
configuration, a live tunnel, credentials, installation, version bumps and
releases remain outside this request.

Future implementation can be delivered in independently validated slices under
this plan. There is no requirement to finish tunnel support before local Google
sign-in, or to enable a tunnel during onboarding. Existing delivered behavior
remains the baseline until the relevant source changes land.

## Baseline and evidence

Read-only review used Platform `b562a96f` and Credential Vault
`f23cd95df945dbe3e56d1d683ada35007ca11166`. The reference repository had unrelated
working changes; no files there were edited. See the
[dated reference follow-up](../research/2026-09-01-credential-vault-admin-and-google-linking-reference.md#2026-10-24-follow-up-dual-bootstrap-and-managed-remote-access)
for source findings and primary documentation.

| Area | Observed baseline | Remaining work |
| --- | --- | --- |
| First Admin | Local-password setup, serialized uniqueness checks, owner mapping and rollback | Add the Google path through the same commit boundary |
| Google | Optional Web GIS button, ID-token verification, linked-subject login | Registered Desktop client, system-browser PKCE transaction and private result handoff |
| Account methods | Password step-up, same-email Google linking/unlinking, method projection | First password for Google-only account; Google-based fresh proof |
| Mobile | Device-session Google endpoint/client wrappers and separate audiences | Inspect actual UI/native flow and package support; do not infer completion from the endpoint |
| Shared ingress | Dedicated listener, ngrok SDK worker, Desktop form, external-proxy mode and restore | Protected secret storage/migration, managed Funnel, recovery/ownership and truthful readiness |
| Telegram | Polling and webhook handler; general browser auth gate precedes webhook dispatch | Verify and correct the webhook-specific admission path without weakening ordinary APIs |
| App MCP | Shared mounts and separate credentials, local integration fixtures | Real provider and external-assistant read/submit acceptance |

Older documents contain historical claims such as shared ingress not existing
and Google-only bootstrap being forbidden. The new records clarify precedence;
they do not turn source inspection or previously recorded fixtures into new live
acceptance.

## Delivery sequence

`P0 contracts -> P1 account domain + P2 native OAuth -> P3 remote providers -> P4 consumers -> P5 acceptance`

P1/P2 must agree on the provisional setup transaction before either integration
lands. P3 can use isolated auth fixtures; it cannot auto-enable public admission
to bypass incomplete setup. P4 begins only after the relevant provider/auth
boundaries pass focused integration checks.

### P0 — Freeze contracts and implementation entry conditions

- [x] Record the owner's dual bootstrap and remote-Web deferral.
- [x] Inspect Credential Vault and existing Cats code without user-state writes.
- [x] Create the five planning documents and update supersession/extension links.
- [ ] Freeze native OAuth start/complete/cancel purposes, private host/Platform
  handoff, proof binding, expiry, concurrent attempts and browser-session issuance.
- [ ] Establish publisher-owned Google Desktop client/consent configuration,
  packaging injection and live-test account availability without collecting
  user secrets in tracked files.
- [ ] Inventory public routes/auth consumers, including the actual Telegram
  cookie-gate conflict, internal Runtime/Code/Cat tools and existing Web routes.
- [ ] Freeze remote settings/status schema, secure-store references, retry/timeout
  values, generation fences and provider ownership journal.
- [ ] Choose/prove a Funnel lifecycle: prefer process-bound managed forwarding;
  any persisted `--bg` mapping must pass stale-target/crash ownership checks
  before being enabled. Define behavior when an existing mapping cannot be adopted.
- [ ] Inspect Mobile Google UI/SDK and Expo/runtime constraints. If Google-only
  owners cannot obtain a device session, include the minimum native-client work
  in P2/P4 rather than silently requiring an otherwise optional local password.
- [ ] Classify additive versus breaking API/config/data changes. Reserve the
  next 0.x minor only if necessary; perform no bump without release authorization.

Exit: reviewable wire contracts, provider prerequisites and compatibility decision.
No unresolved security or persistence choice is disguised as an implementation detail.

### P1 — Convergent account model and initialization

- [ ] Refactor the existing setup operation to accept one validated local
  credential or a bound verified Google setup result.
- [ ] Preserve one serialized check for uninitialized/no-account state and
  logically atomic auth/Core/owner commit with failure recovery.
- [ ] Implement the Google-only first-password operation, unique local identifier,
  same-account persistence and purpose-bound fresh Google proof.
- [ ] Retain explicit same-email Google linking, stable subject uniqueness,
  legacy handle/email adoption and current-password grants where applicable.
- [ ] Preserve usable-method/unlink invariants, session revocation and secret-free
  security events.
- [ ] Prove existing profile compatibility and all required migration/recovery
  behavior before adding UI.

Exit: SPEC-129 A1-A7 pass with isolated stores and injected verifiers.
No real Google acceptance claim from this phase.

### P2 — Native Google and account/onboarding UX

- [ ] Implement a bounded Desktop system-browser OAuth transaction with PKCE,
  state, nonce, transient loopback callback and authenticated private handoff.
- [ ] Handle completion, cancellation, denied consent, expiry, replay, offline
  state, restart and full-exit cleanup without partial account mutation.
- [ ] Show the two first-run choices; preserve the existing provider/Catlas
  onboarding sequence and explicit setup completion.
- [ ] Add account-method completion to the existing General Account section;
  derive states from Identities and keep password creation optional.
- [ ] Preserve configured GIS/self-hosted behavior without using its client ID
  as the Desktop client or promising arbitrary-origin Web support.
- [ ] Verify the existing Mobile Google path, or implement the required native
  sign-in for Google-only accounts within approved mobile packaging contracts.
  Track its delivery separately from the Desktop slice; no embedded tunnel GIS.
- [ ] Test both fresh-account sequences and an existing local/handle/linked
  profile; preserve account IDs, roles and owner data.

Exit: native Desktop acceptance is recorded independently per OS; Google-only
Mobile readiness has an explicit evidence-backed state. No tunnel is required
to complete either Desktop bootstrap path.

### P3 — Desktop-managed remote connection

- [ ] Extend the existing Platform ingress; keep ngrok, Funnel and external
  adapters under one serialized lifecycle and shared listener.
- [ ] Implement profile-scoped OS credential storage and protected migration of
  existing plaintext authtokens/configuration, including failure/restart fixtures.
- [ ] Implement ngrok assigned-name discovery/reuse and distinct account/domain
  errors; protect worker lifetime and late-result races.
- [ ] Add Funnel client/login/policy/OS-support detection, first-time user
  approval guidance, exact mapping ownership and conflict-aware cleanup.
- [ ] Prove no stale mapping forwards into an unrelated reused port. Failed
  ownership/cleanup leaves Cats admission closed and reports needs-action.
- [ ] Support external fixed-origin/port mode without taking ownership of
  the user's external tunnel.
- [ ] Add desired enablement/auto-connect, background startup/wake/network
  reconciliation, bounded retries and distinct provider/public-reachability state.
- [ ] Compose the Remote access Settings form and pairing/App navigation into
  existing shells; ordinary users do not need local-port or enrollment-key forms.

Exit: SPEC-130 R1-R5/R10-R12 lifecycle and isolation cases pass to the evidence
level claimed. Public verification needs an independent client, not self-probing.

### P4 — Shared consumers and public route policy

- [ ] Bind the public route/auth matrix ahead of dispatch. Retain internal
  management/tool denial, canonical path/Host checks and untrusted-header handling.
- [ ] Admit Telegram webhook calls to their binding-specific secret verifier
  without browser cookie/CSRF requirements. Make secret verification mandatory
  for this managed public mode; retain request bounds and durable deduplication.
- [ ] Reconcile webhook registration for usable-origin changes, restart,
  binding changes and mode switches. Preserve polling-first setup.
- [ ] Generate Mobile pairing from current usable origin; keep private APIs/
  streams bearer-authenticated and verify Google-only and password-only accounts.
- [ ] Reuse App mounts/credentials/sandboxes and confirm one-App disable does not
  disconnect Mobile or the other App. Keep Ask question/storage/MCP ownership in Apps.
- [ ] Update Ask instructions when the URL changes and report any external
  connector reconnection the user must perform.
- [ ] Verify actual MCP protocol headers/methods, streaming abort/timeout and
  provider response behavior without interactive browser challenges.

Exit: local shared-consumer fixtures pass before external testing. Native
Google remains on its temporary loopback callback; remote Web remains deferred.

### P5 — Acceptance, compatibility and future delivery

- [ ] Run both complete Admin journeys, comparing stable Account/owner identity,
  privileges and login capability, plus cancel/conflict/repair cases.
- [ ] Use dedicated isolated test profiles for live Google and each provider;
  verify packaged OS behavior separately.
- [ ] Exercise a real phone, Telegram webhook and two App/MCP routes through one
  origin. Match Ask external-assistant request/receipt IDs and reopened answer.
- [ ] Exercise restart, tray, full exit, sleep/wake, network loss, URL changes,
  duplicate webhook, credential revocation and unrelated Funnel mapping survival.
- [ ] Verify upgrades from existing auth and ingress settings, backup protection,
  rollback limits, partial failure and restart recovery.
- [ ] Record passed checks, independent-review outcome and remaining OS/live
  gaps. If source work is authorized later, obtain independent review through
  the repository's applicable workflow; author checks are not independent review.
- [ ] Prepare compatibility/release notes and exact pins only within an authorized
  implementation/release scope. Publication remains a separate user action.

Exit: only the actually verified client/provider/OS combinations are called ready.
No remote-Web, shared cloud service or unrelated Runtime/App release is implied.

## Requirement and validation map

| Scope | Requirements / acceptance | Owning phase |
| --- | --- | --- |
| Account creation and equivalence | AUTH-01-07, AUTH-17-24; A1-A7 | P1, P2 |
| Native identity and compatibility | AUTH-08-16, AUTH-25-30; A5/A7-A9 | P0, P2, P5 |
| Config, credentials, lifecycle | REM-01-18, REM-29-32; R1-R5/R10/R12 | P0, P3, P5 |
| Shared authenticated consumers | REM-19-28; R6-R9/R11 | P0, P4, P5 |

Documentation changes validate their diff, links, requirement references and
status consistency only. Implementation phases use focused auth/bootstrap,
Desktop/private bridge, ingress/provider/OS and consumer suites, widening to
affected integrations under the repository testing policy. Do not run full builds
or write user-state records merely to validate these Markdown documents.

## Ownership and affected implementation areas

Platform owns auth contracts/stores, server admission, Settings/onboarding,
Desktop OAuth/provider supervision and Mobile device-session integration.
Likely code areas are `src/platform/auth/`, `src/platform/apps/`,
`src/app/server/`, `src/app/renderer/auth/`, `src/app/renderer/setup/`,
`src/app/renderer/settings/`, `desktop/host/` and `mobile/`.
These are implementation candidates, not files changed by this plan.

Apps owns Ask behavior and connector instructions; coordinate only the actual
consumer change, preserving the public package boundary. Runtime has no new
public listener or account responsibility in this scope. cats-one and
cats-plugins need no new services. Provider-specific work shares this plan.

## Checkpoint — 2026-10-25

The five primary documents and related historical-reference/index amendments
record the requested direction. All implementation, live Google/provider,
Mobile/Bot acceptance and OS packaging tasks remain pending.

Documentation validation:

- Whitespace/diff check passed for tracked amendments.
- Local target/heading checks passed for 81 newly added Markdown references
  across five new primary documents and 18 related amendments.
- Requirement identifiers are unique and contiguous: AUTH-01 through AUTH-30,
  REM-01 through REM-32. Scope is confined to Markdown documentation.
- These are author-run document checks, not independent implementation review.
  No application suite/build, live OAuth, tunnel or user-state write was performed.

*Last updated: 2026-10-25*
