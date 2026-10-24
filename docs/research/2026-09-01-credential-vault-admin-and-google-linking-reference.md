# Credential Vault Admin Bootstrap and Google Linking Reference

Date: 2026-09-01

Updated 2026-10-24 with the
[dual-bootstrap follow-up](#2026-10-24-follow-up-dual-bootstrap-and-managed-remote-access).
The September observations/recommendations below are historical, including the
previous mandatory-local-password policy; do not treat them as the current target.

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

## 2026-10-24 follow-up: dual bootstrap and managed remote access

### Source review and changed direction

Read-only source/test inspection used Credential Vault revision
`f23cd95df945dbe3e56d1d683ada35007ca11166` in
`../sammykenny2/credential-vault` relative to the Cats workspace root.
Unrelated working edits were left intact. No credentials, databases, provider
configuration or private vault payloads were read, and no tests or live OAuth
flows were run in that repository.

The inspected source now supports:

- With no Admin, the first successful Google login is promoted; configured
  `ADMIN_EMAIL` optionally restricts which account may be promoted.
- Manual email/password setup creates the first Admin.
- Explicit Google linking verifies the same email and provider-subject
  uniqueness. Ordinary Vault Google login also has automatic email linking;
  that behavior is not selected for Cats.
- An Admin without a login password can add one and then use email/password
  login. The current setter requires proof that the vault is unlocked, as well
  as the current session. Existing passwords cannot be replaced by that operation.
- The earlier callback's undefined-`settings` defect is not present in the
  inspected version: the callback loads settings. This is static evidence,
  not a fresh full security or execution review.

The two completed paths have equivalent login capabilities/authority. Cats
will implement this product behavior using its Account/Identity separation,
not Vault placeholder IDs or automatic account claiming by email. Vault proof
is specific to its encryption model; Cats needs fresh verification of the
existing method and a purpose-bound server action proof instead.

The owner explicitly requested these alternatives for Cats and deferred remote
Web in the first stage. This supersedes the September recommendation that every
first Admin must start with a local password. See
[ADR-138](../decisions/138-converge-google-and-password-admin-bootstrap.md) and
[SPEC-129](../specs/SPEC-129-desktop-admin-bootstrap-and-google-sign-in.md).

### Cats baseline observed

At Platform `b562a96f`, source inspection finds local-only first-admin setup,
optional Web GIS, linked-subject login, password step-up and same-email linking.
Identity records can represent a Google-only account, but the bootstrap and
first-password operations described in SPEC-129 are not delivered.

Shared ingress, an ngrok SDK worker, external-proxy mode, settings and startup
restore already exist. A managed Funnel adapter, protected migration of inline
authtokens and the full provider recovery contract remain future work.
The general browser auth gate currently precedes Telegram webhook dispatch;
the webhook route is not in its public-route policy. The managed public
webhook path therefore needs explicit binding-secret admission, not an assumption
that opening a tunnel makes Telegram functional.

### Primary documentation checked on 2026-10-24

| Source | Finding | Design consequence |
| --- | --- | --- |
| [Google Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app) | System-browser code flow, PKCE and a loopback callback are supported for Desktop public clients | Desktop sign-in need not depend on any tunnel domain; verify the actual registered client/library/OS |
| [GIS setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) and [client rules](https://support.google.com/cloud/answer/15549257) | Web JavaScript origins must be registered; redirect URLs are additionally configured when used; wildcard origins/redirects are not accepted | Existing GIS cannot automatically cover every user's tunnel origin; remote Web/broker is deferred |
| [ngrok Node SDK](https://ngrok.github.io/ngrok-javascript/interfaces/Config.html) and [domains](https://ngrok.com/docs/gateway/domains) | Authtoken-backed forwarding and assigned stable dev domains are available; specified domains need account authorization/configuration | Default UI can discover the assigned name; custom name is advanced; test the pinned SDK/account behavior |
| [Tailscale identity](https://tailscale.com/docs/concepts/tailscale-identity) and [Funnel requirements](https://tailscale.com/docs/features/tailscale-funnel) | Ordinary login differs from unattended enrollment keys; Funnel uses tailnet DNS and requires client/platform, HTTPS and policy support | Guide login/approval and detect the device origin; do not ask ordinary users for an enrollment key |
| [Funnel command lifecycle](https://tailscale.com/docs/reference/tailscale-cli/funnel) | Background mode can survive daemon/device restarts | Own exact forwarding and avoid stale targets; never reset unrelated mappings |

These facts establish architectural options, not successful Google/provider
operation in Cats. Limits, client support and provider-account configuration
must be rechecked during implementation. No shared cloud service was selected
or provisioned. [ADR-139](../decisions/139-manage-one-desktop-remote-ingress.md),
[SPEC-130](../specs/SPEC-130-desktop-managed-remote-access.md) and
[PLAN-122](../plans/PLAN-122-desktop-identity-and-remote-access-rollout.md)
capture the combined follow-through.

*Last updated: 2026-10-25*
