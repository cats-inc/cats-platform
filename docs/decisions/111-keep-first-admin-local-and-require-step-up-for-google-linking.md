# ADR-111: Keep First-Admin Bootstrap Local and Require Step-Up for Google Linking

## Status

Proposed

## Date

2026-09-01

## Context

[ADR-096](./096-adopt-platform-owned-auth-sessions-with-google-as-identity-provider.md)
established the correct platform boundary: Cats owns accounts, identities,
memberships, and revocable sessions; Google is only an identity provider. Most
of that foundation is now implemented. The remaining product gap is narrower:

- the setup renderer creates a local Admin, but the setup API still permits a
  credential-less completion path;
- a standalone Google first-admin route can create a Google-only owner if it
  is called before any account exists, although the setup UI does not expose
  that route;
- Google login correctly rejects identities that are not already linked;
- a Google link route exists, but Settings does not expose it;
- the link route requires the current session, Cats CSRF, GIS CSRF, and a
  verified Google credential, but it does not require recent local-password
  reauthentication or enforce account-email matching;
- auth status does not report which login methods are linked, so the renderer
  cannot present truthful account state.

The local Credential Vault reference demonstrates a useful Settings pattern:
show linked status, ask for the current password, return through Google, and
record an audit event. It also demonstrates why UI sequencing is not an
authorization boundary: its link endpoint does not receive a server-bound
proof of the password step. Cats should adopt the interaction model while
keeping its stronger server-session and provider-verification foundation.

The product is local-first and may run offline, on a raw LAN IP, or on an
origin that Google does not authorize. A Google-only first Admin would make
ordinary local recovery depend on an external provider. Conversely, silently
linking by email or creating any Google user that can reach the host would
weaken the explicit Cats account boundary.

## Decision

If accepted, this ADR narrows ADR-096's first-admin choice and defines the
identity-link lifecycle as follows.

### 1. Every real first-admin setup creates a local password identity

The production `/setup` completion path requires an Admin identifier and a
local password. It creates the Account, local-password Identity,
owner/admin Membership, owner mapping, and browser Session as one serialized
bootstrap operation.

Google may be linked after that operation, but it is not the sole first-admin
credential. The standalone Google-only first-admin route is removed rather
than retained as an unreleased compatibility path. Repair mode continues to
create a local Admin through its one-time recovery-token boundary.

First-admin creation must recheck "no Admin exists" inside the same serialized
auth-state mutation that creates the account. A prior setup-status read or a
renderer route gate is not sufficient concurrency control.

### 2. Settings owns the login-method lifecycle

`Settings > General > Account` displays the authenticated account's login
methods:

- Local password: linked
- Google: linked to a verified email, available to link, or unavailable because
  the provider/origin is not configured

The existing platform Settings shell owns navigation exactly once. The feature
adds an Account section body, not another nested Settings shell or product-owned
settings route.

### 3. Linking is an explicit step-up-protected account action

Google linking requires all of the following server-side checks:

1. a valid Cats browser session;
2. an allowlisted browser origin and a valid Cats synchronizer CSRF token;
3. recent successful verification of the current account's local password;
4. a short-lived, single-use action grant bound to the account, browser
   session, and `link_google` purpose;
5. a valid GIS double-submit CSRF token;
6. a Google ID token verified for signature, audience, issuer, expiry,
   verified email, and configured hosted domain;
7. a stable Google `sub` not owned by another Cats account; and
8. at most one Google identity for the Cats account.

The action grant is an opaque high-entropy token. Cats returns the raw token
once, stores only a keyed hash, never writes it to logs, expires it after five
minutes, and consumes it on the first link attempt. A renderer password modal
without this server-issued grant is insufficient.

### 4. Verified email is a binding constraint, not an account-claim shortcut

If the Cats account already has an email, the verified Google email must equal
it after trim and lowercase normalization. Cats does not apply Gmail alias,
dot, or plus-address canonicalization.

If the account email is `null` because the local Admin identifier is a handle,
the successful, step-up-protected link may adopt the verified Google email as
the account email. Ordinary Google login never finds, claims, creates, or
merges a Cats account by email.

### 5. Google login remains linked-identity-only

Google login resolves only an existing Google Identity by stable provider
`sub`. An unknown Google identity receives the existing generic unlinked or
unauthenticated response. Cats does not automatically create a user, claim a
pre-provisioned account by email, or promote an email to Admin.

Headless multi-user invitation and predeclared `ADMIN_EMAIL` flows remain out
of scope. They require a later account-administration design with an explicit
invitation or one-time bootstrap capability.

### 6. Unlinking preserves recovery and invalidates ambient access

Google may be unlinked only after a fresh local-password action grant bound to
`unlink_google`. The server rejects unlink when it would leave the account
without another usable login method.

On successful unlink, Cats removes the Google Identity, revokes every other
browser and mobile session for the account, keeps the current step-up-verified
browser session, and rotates its CSRF token. This avoids preserving sessions
that may have originated from the removed provider.

### 7. Identity lifecycle actions emit security events

First-admin creation, Google link, Google unlink, link conflict, and failed
step-up emit secret-free structured security events. Events include stable Cats
account/session identifiers and outcome codes, but never passwords, raw
session/action tokens, Google credentials, or full provider-token claims.

A durable, user-facing audit-log product is not required in this slice. The
event boundary must be injectable so a later audit sink can persist the same
events without rewriting auth routes.

### 8. The last-active-admin rule is a forward invariant

Cats does not add multi-user administration in this slice. Any later endpoint
that deactivates, deletes, or demotes an Admin must reject the mutation when it
would leave no active Admin. That check belongs inside the same auth-state
mutation as the lifecycle change, not only in the renderer.

## Consequences

### Positive

- Every workspace retains an offline/local recovery credential.
- The missing Google-link entry point becomes discoverable and truthful in
  Settings.
- A stolen session and CSRF token are not enough to attach an attacker's
  Google identity.
- Google `sub` remains the identity key while verified email prevents an
  unexpected cross-email binding.
- Unknown Google users cannot create or claim Cats accounts.
- Unlinking cannot strand the owner or leave unrelated sessions active.
- The design reuses Cats' HttpOnly sessions, CSRF, separated identity records,
  and existing GIS verifier rather than importing a second token model.

### Negative

- Linking requires another password entry and a short-lived server action
  grant.
- Owners who chose a non-email local handle cannot preflight email equality;
  their first successful link adopts the verified Google email.
- Unlinking signs out other browsers and mobile devices for that account.
- Removing the Google-only setup route changes an already implemented API,
  although the product is pre-release and has no supported compatibility
  obligation.

### Neutral

- This decision does not add Google API scopes, access tokens, refresh tokens,
  or offline access.
- The browser flow remains GIS ID-token POST, so authorization-code `state` and
  PKCE are not introduced for this surface.
- Mobile may use a linked Google identity to log in, but account linking and
  unlinking remain authenticated browser Settings actions in this slice.
- This decision does not add password reset, account invitations, role editing,
  or a durable audit-log UI.

## Alternatives Considered

### Keep Google-only first-admin bootstrap

- **Pros**: fewest setup fields when Google works; matches the broad option in
  ADR-096.
- **Cons**: no local credential when Google or the authorized origin is
  unavailable; creates another first-caller bootstrap surface.
- **Why rejected**: a local-first desktop owner should not depend on an
  external identity provider for ordinary recovery.

### Link Google from any authenticated session without step-up

- **Pros**: simplest implementation; the current backend route is close to
  this shape.
- **Cons**: session theft is enough to bind an attacker-controlled Google
  identity and gain durable future access.
- **Why rejected**: identity linking changes the account's future
  authentication boundary and requires stronger proof than ordinary settings
  mutations.

### Treat the password modal as the step-up boundary

- **Pros**: good visible UX and no extra server record.
- **Cons**: API callers can skip the modal; two unrelated successful requests
  do not prove one authorized transaction.
- **Why rejected**: authorization must be enforced and bound on the server.

### Automatically link or create by verified email during Google login

- **Pros**: low-friction account claim and future invitation UX.
- **Cons**: conflates login with account creation/linking, makes email a hidden
  authorization key, and opens every configured Google account to workspace
  creation unless another admission policy exists.
- **Why rejected**: Cats does not yet have invitations or multi-user admission
  policy. Linking remains explicit.

### Store a recent-password timestamp directly on the session

- **Pros**: fewer tokens and simpler API calls.
- **Cons**: a broad time window can authorize multiple unrelated sensitive
  actions and cannot be consumed for one purpose.
- **Why rejected**: a purpose-bound one-time action grant provides the narrower
  capability.

## References

- [Credential Vault Admin Bootstrap and Google Linking Reference](../research/2026-09-01-credential-vault-admin-and-google-linking-reference.md)
- [SPEC-113: Admin Bootstrap and Google Account Linking](../specs/SPEC-113-admin-bootstrap-and-google-account-linking.md)
- [PLAN-104: Admin Bootstrap and Google Account Linking Rollout](../plans/PLAN-104-admin-bootstrap-and-google-account-linking-rollout.md)
- [ADR-096: Adopt Platform-Owned Auth Sessions with Google as an Identity Provider](./096-adopt-platform-owned-auth-sessions-with-google-as-identity-provider.md)
- [SPEC-100: Platform Authentication, Admin Bootstrap, and Google Identity](../specs/SPEC-100-platform-authentication-admin-bootstrap-and-google-identity.md)
- [ADR-072: Settings Composition Layer Lives in `src/design/`](./072-settings-composition-layer-in-design.md)

---

*Decision proposed: 2026-09-01*
*Decision makers: User + Codex (pending approval)*
