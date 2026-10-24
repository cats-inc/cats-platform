# ADR-138: Converge Google and Password Admin Bootstrap

## Status

Accepted product direction, 2026-10-24. The owner authorized the first
identity-contract/account-core batch on 2026-10-25; that core is implemented
with isolated verification. Native Desktop OAuth transport/UI, publisher setup
and live acceptance remain pending. No version change or publication is authorized.
Detailed requirements are in
[SPEC-129](../specs/SPEC-129-desktop-admin-bootstrap-and-google-sign-in.md);
delivery is sequenced by
[PLAN-122](../plans/PLAN-122-desktop-identity-and-remote-access-rollout.md).

This partially supersedes [ADR-111](111-keep-first-admin-local-and-require-step-up-for-google-linking.md):
the mandatory-password first-admin rule and local-password-only step-up assumption
are replaced below. Account/Identity/Membership separation, explicit linking,
provider verification, action grants and session revocation remain in force.
[ADR-096](096-adopt-platform-owned-auth-sessions-with-google-as-identity-provider.md)
remains the platform-owned authentication foundation.

## Context

The owner wants the two initialization paths seen in Credential Vault:
Google first, optionally add a password later; or email/password first,
optionally link the same Google email later. Both must converge on one account.
The [reference review](../research/2026-09-01-credential-vault-admin-and-google-linking-reference.md)
records the current source inspection and the limits of borrowing its implementation.

Cats already separates accounts, identities, memberships and sessions.
The delivered wizard requires a local password, and Google GIS login accepts only
linked identities when a Web client ID is configured. It does not provide the
consumer Desktop OAuth flow described here. A tunnel cannot supply missing
Google client configuration or authorize arbitrary Web origins.

## Decision

### One Admin account, two optional login methods

Only an uninitialized Desktop profile with no existing account/Admin can create
the first owner/Admin. Its locally initiated onboarding offers:

| First method | Created identity | Optional later action | Result after both methods exist |
| --- | --- | --- | --- |
| Google | Verified Google `sub` and email | Set the account's first local password | One Account, owner/Admin Membership, Google and local-password Identities |
| Email/password | Local-password Identity using the submitted email | Link Google with the same verified email | The same account and authority shape |

Either initial state is a valid Admin. Adding the other method preserves account
ID, Core owner mapping, roles and owned data. Equivalence concerns authority and
login capabilities; creation timestamps and audit history can differ.
Ordinary login after initialization never creates or promotes an unknown user.
Missing/corrupt auth data after completed setup enters repair, not first-claim setup.

Both first-admin paths use the same serialized uniqueness check and logically
atomic auth/Core setup operation. The Google transaction is bound to the
locally initiated onboarding attempt; public reachability is not setup authority.
Remote access stays off until authenticated setup is complete.

### Desktop Google login uses a native public client

Cats Desktop opens the system browser and uses a Google Desktop OAuth client,
authorization code with PKCE S256, transaction state and an OIDC nonce.
A short-lived listener on an available `127.0.0.1` port receives the response.
The Desktop host owns this bounded login transaction and supplies the verified,
single-use result to Platform over its private authenticated host seam.
Platform owns account mutation and issues the normal Cats session.

The public tunnel is not a Google callback target. No per-user tunnel domain
registration is required for Desktop sign-in. A distribution uses a publisher-
configured Desktop client ID; ordinary users do not create Google Cloud projects.
An OAuth client ID identifies the application, not an individual user.
Installed apps cannot protect a shared confidential-client secret; neither a Web
client secret nor a privileged Cats service credential may be embedded.
Publication/consent configuration and packaged-client acceptance remain delivery gates.

Google is used for identity only (`openid email profile`); this decision requests
no Drive/Calendar permissions or Google offline access/refresh-token storage.
Cats sessions remain distinct from Google tokens.

### Complete an existing account deliberately

The password-first route uses email for new accounts. Existing handle-based
accounts keep working; the existing explicit verified-email adoption rule remains.
Google linking requires the account's current method to be freshly verified,
then verifies the Google assertion, matching normalized email and unique `sub`.
Ordinary Google login cannot claim another account just by matching email.

A Google-only Admin adds its first password after fresh verification of the
already-linked Google subject, bound to a single-use `set_password` action.
It cannot be asked for a nonexistent local password. Existing-password changes
and forgotten-password reset are separate features, not implicit behavior here.
At least one usable method must survive any unlink operation. Existing secure
link/unlink grants and revocation behavior are preserved and extended as needed.

### Client and delivery boundaries

| Surface | First-stage scope |
| --- | --- |
| Desktop onboarding, sign-in and account Settings | Dual bootstrap and native Google flow above |
| Native Mobile | Existing Cats device-session boundary; separately registered platform clients if Google is enabled; no Web GIS inside a tunnel page |
| Remote Web | Deferred, including Google login and a consumer remote-browser experience |
| Shared cloud authentication service | Not introduced or deployed |

Mobile Google UI/SDK completion is not a prerequisite for Desktop bootstrap;
its actual delivery status must be reported separately. Existing operator-managed
Web/GIS deployments remain subject to their configured Google origins and client
types; this decision does not silently disable or broaden them.

## Consequences

- Onboarding can start with either method; password setup remains optional for
  a Google-created Admin. Offline local login is available once a password exists.
- Native Desktop authentication works independently of ngrok/Funnel availability.
- A Google-only account needs a different step-up proof from the delivered
  password-only flow. Account Settings must display both partial states truthfully.
- New contracts must preserve existing profiles and sessions according to
  SPEC-129's compatibility/upgrade requirements. No schema change is assumed necessary.

## Alternatives Considered

- **Always require a password first:** the delivered baseline, replaced by the
  owner's requested two-path experience.
- **Run Web GIS at each tunnel origin:** requires Google origin configuration
  for users' domains; does not meet Desktop setup goals.
- **Host a central OAuth broker:** could support a later remote Web product,
  but adds a public cloud service outside the owner's current scope.
- **Automatically merge by email:** rejects the explicit ownership proof and
  stable provider-subject boundary retained by this decision.

## References

- [ADR-139: Desktop-managed remote ingress](139-manage-one-desktop-remote-ingress.md)
- [Google Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google GIS Web setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Google client/origin rules](https://support.google.com/cloud/answer/15549257)

*Last updated: 2026-10-25*
