# Credential Vault Admin Bootstrap and Google Linking Reference

Date: 2026-09-01

## Topic

Local reference review of the first-admin, local break-glass login, Google
OAuth, and Google account-linking flows in the sibling `credential-vault`
project.

## Source and Scope

- Source: local sibling repository `sammykenny2/credential-vault`
- Reviewed revision: `aa0a353f6b282c1158ff5f014286c15c8731dd17`
- Review method: static source and test inspection only
- Sensitive-data boundary: no `.env`, database, credential payload, token, or
  user data was read

This note records transferable product and security lessons. It is not a
proposal to copy Credential Vault's auth stack into Cats.

## Observed Flow

### First admin

Credential Vault exposes a setup-status read and a first-admin creation form.
The setup route accepts an email, display name, and password, creates the admin,
and immediately returns login tokens. A startup bootstrap service also supports
an operator-configured admin email: with a configured password it creates a
local break-glass admin; without one it intends to promote the first matching
Google login.

The setup UX is clear, but the public "no admin exists" mutation is not tied to
a one-time setup capability and its read-then-create sequence is not visibly
protected by a singleton transaction. On an exposed host, the first reachable
caller could race the intended operator.

### Google login and linking

Credential Vault uses an authorization-code flow. A Google callback first
looks up the stable Google user id, then automatically claims an existing
account by matching email, and otherwise automatically creates a normal user.

The explicit Settings linking flow is more conservative:

1. Settings shows whether Google is linked.
2. The user chooses **Link Google Account**.
3. A password modal verifies the local password.
4. The browser redirects through Google.
5. The link endpoint requires the verified Google email to match the current
   account email and rejects a Google user id already owned by another account.
6. A link audit event is recorded.

This is a useful product shape, but the password verification is only a client
sequence. The later link endpoint does not require a server-issued proof that
the current session actually completed the password step. A caller holding the
JWT can call the link endpoint directly.

### Admin lifecycle

The user service prevents self-deletion and blocks removal, deactivation, or
demotion of the last active admin. Account lifecycle and role changes emit
audit events. These are valuable forward invariants for future Cats multi-user
administration even though Cats currently exposes only the first-admin UI.

## Patterns Worth Adapting

- A dedicated, explicit first-admin setup experience that ends in an
  authenticated session.
- A Settings authentication card that reports each login method's linked state
  and exposes a deliberate linking action.
- Local password as a break-glass method when Google, the network, or an
  authorized browser origin is unavailable.
- Server-side comparison of a verified Google email with the Cats account
  email, plus uniqueness of the stable provider subject.
- Security-event recording for identity link/unlink and admin lifecycle
  mutations.
- A last-active-admin invariant before future account management ships.
- A predeclared admin email as a possible headless-deployment control, but only
  if Cats later designs an explicit, one-time bootstrap capability around it.

## Patterns Cats Should Not Copy

- Storing local and Google identity state in one account row with placeholder
  Google ids. Cats already has the safer Account / Identity separation.
- Automatically creating a user for any valid Google account.
- Automatically claiming an existing account by email during ordinary login.
- Treating a client-side password modal as sufficient step-up authorization.
- Storing access and refresh JWTs in browser `localStorage`.
- Stateless refresh JWTs without Cats-owned per-session revocation records.
- OAuth authorization without a server-bound `state` transaction and PKCE.
- Accepting an arbitrary client-provided redirect URI without a server
  allowlist.
- Requesting offline access and repeated consent when no Google refresh token
  is used.

Cats' browser Google path uses Google Identity Services ID-token credentials,
not Credential Vault's authorization-code flow. OAuth `state` and PKCE are
therefore not requirements for Cats' current GIS credential POST. Cats must
continue to enforce the GIS double-submit CSRF token, the Cats session CSRF
token, server-side ID-token verification, and a server-owned step-up proof.

## Confirmed Reference Defects

Static inspection found two implementation defects that reinforce using the
reference selectively:

- The first-time Google callback branch reads `settings.admin_email` without a
  `settings` value in scope, so that branch can fail at runtime.
- Bootstrap-created admins receive a `bootstrap-...` placeholder Google id,
  while the linked-state property excludes only `setup-...` placeholders. A
  bootstrap admin can therefore appear Google-linked when it is not.

## Implications for Cats

1. Keep the local first-admin path as the required bootstrap and recovery
   anchor.
2. Put Google linking in `Settings > General > Account`, where Cats already
   exposes sign-out, rather than adding another Settings shell or navigation
   rail.
3. Require a short-lived, one-time, server-owned action grant produced by local
   password reauthentication before Google link or unlink.
4. Allow Google login only for an already-linked stable Google `sub`; never
   create or email-claim an account during ordinary login.
5. If the Cats account already has an email, require an exact normalized match.
   If it has no email because the local identifier is a handle, adopt the
   verified Google email only after successful step-up and linking.
6. Preserve at least one usable login method and revoke other account sessions
   after unlinking Google.
7. Serialize first-admin creation and keep future last-admin checks inside the
   same state mutation that performs the role or account change.

## Related Project Documents

- [ADR-111](../decisions/111-keep-first-admin-local-and-require-step-up-for-google-linking.md)
- [SPEC-113](../specs/SPEC-113-admin-bootstrap-and-google-account-linking.md)
- [PLAN-104](../plans/PLAN-104-admin-bootstrap-and-google-account-linking-rollout.md)
- [ADR-096](../decisions/096-adopt-platform-owned-auth-sessions-with-google-as-identity-provider.md)
- [SPEC-100](../specs/SPEC-100-platform-authentication-admin-bootstrap-and-google-identity.md)

---

*Last updated: 2026-09-01*
