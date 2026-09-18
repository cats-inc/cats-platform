# ADR-117: Separate Artifact Trust from Desktop Release Identity

> Signing and notarization decide whether a build can be installed and can
> update itself. Official-versus-preview decides which feed it follows and what
> it may claim. These are independent axes, and each platform resolves the
> first one as soon as its credentials exist. The same rule bounds what a
> release set claims: an architecture ships when someone can execute it first.

## Status

Accepted

## Context

SPEC-111 defines the manual-dispatch preview as an *unsigned* build. That
definition is currently load-bearing in the implementation: every signing
secret in `desktop-release.yml` is gated on `preview == 'false'`, and
`--preview` sets `CSC_IDENTITY_AUTO_DISCOVERY=false` through
`buildInstallerEnvironment`. One boolean therefore decides both whether the
artifact is trusted by the operating system and what the build is allowed to
claim about itself.

On macOS that coupling has consequences the specification did not intend:

- **The preview cannot be installed without manual intervention.** A downloaded
  artifact carries `com.apple.quarantine`. An unsigned, un-notarized app with
  that attribute is refused by Gatekeeper, and macOS 15 removed the
  right-click-to-open bypass. The user must go through System Settings or run
  `xattr -dr com.apple.quarantine` by hand.
- **The preview cannot self-update at all.** Squirrel.Mac validates the code
  signature of a downloaded update and refuses to apply an unsigned one. This is
  system framework behavior, not an electron-updater policy, and it has no
  opt-out.

The second point creates a circular dependency inside SPEC-111 itself. Gate G3
in PLAN-101 requires a real old-version-to-new-version upgrade to pass on a
platform before that platform may advertise self-update. The preview exists
precisely so that the update client can be exercised before official releases
are possible — but an unsigned macOS preview can never perform an update, so
the evidence G3 asks for cannot be produced.

Credential availability also differs per platform and is not something the
release contract controls. The Apple Developer Program membership and its
Developer ID certificate are in hand; the Windows code signing certificate is
not yet purchased. Binding both to a single release-mode switch makes macOS
verifiability wait on a Windows procurement timeline that has nothing to do
with it.

The project needs to decide whether "signed" and "official" are the same
statement, and if not, how each is resolved.

## Decision

### 1. Artifact trust and release identity are orthogonal

**Artifact trust** is whether the operating system accepts the binary: code
signature, notarization, and stapled ticket. It determines whether a user can
install the build and whether the build can replace itself.

**Release identity** is what the build claims: official or preview, which feed
it resolves to, and whether it counts toward release readiness. It comes from
the provenance the guarded workflow embeds in the release descriptor, exactly
as SPEC-111 requirement 1.9 already states.

A signed preview is not a contradiction. Its binary is trusted by the platform;
its identity is still a preview.

### 2. Trust is resolved per platform, as credentials arrive

A platform starts signing when its credentials exist. It does not wait for the
other platforms.

- **macOS**: signed with Developer ID Application and notarized, for both
  preview and official builds. Credentials are available now.
- **Windows**: unsigned for both preview and official builds until a
  certificate is obtained. The existing release gate continues to refuse an
  official Windows release without `WIN_CSC_LINK`, so this cannot be shipped by
  accident.
- **Linux**: unchanged; the `.deb` is not signed and this decision does not
  change that.

**Explicit unsigned preview (2026-09-18 amendment):** an operator may request
`unsigned=true` on manual workflow dispatch. This withholds signing/notarization
credentials, skips Apple key staging and disables identity discovery for that
preview only. The default stays platform-based signing; tag-triggered official
releases cannot opt out. An explicitly unsigned macOS preview requires manual
installation and does not qualify as self-update validation. This exception
implements the operator's explicit unsigned release request for 0.3.3.

### 3. Signing does not promote a preview

A signed, notarized preview still:

- publishes to a GitHub prerelease and never becomes `latest`
- embeds a descriptor whose kind is `preview` and resolves to
  `preview_packaged`, never `official_packaged`
- labels itself as a preview in Tray and Settings
- remains outside `DESKTOP_RELEASE_READY_PLATFORMS`

Signing makes the G3 upgrade test *possible* on macOS. It does not satisfy it.
That gate is still earned by running the upgrade.

### 4. Names state what is true

`unsigned-preview-*` as an Actions artifact name becomes a false statement once
macOS previews are signed. Preview artifacts are named `preview-*`.

SPEC-111's rule that preview artifacts must not enter the stable update feed is
retained, but its justification changes: a preview is excluded because of its
identity, not because it is unsigned.

### 5. Local packaging still requires an explicit opt-in to sign

Local and test packaging continue to disable signing identity discovery by
default. A developer machine may hold unrelated certificates, and silently
picking one up is worse than producing an unsigned build.

This costs nothing in practice: a locally built app carries no quarantine
attribute, so Gatekeeper does not evaluate it. Signing a local build is an
explicit request, never an inference from the environment.

### 6. Verification capability bounds the release set, the way credentials bound trust

The same reasoning applies one level out. A platform signs when its credentials
exist; a target set ships an architecture when someone can execute it before
release.

macOS therefore ships x64 only while the available hardware is an Intel Mac and
a Linux arm64 board — the board's architecture does not substitute for a
different operating system. A universal build would place an unverified arm64
slice in every artifact and add packaging and notarization time to each preview
iteration, which is a cost paid on every development cycle. SPEC-111 section 8
records this as a stage-specific narrowing of ADR-108 section 6, together with
the conditions for revisiting it.

Neither trust nor architecture coverage is a property to maximize on principle.
Each is claimed when it can be honoured and verified, and narrowing either one
is a decision rather than a defect.

## Consequences

### Positive

- The macOS upgrade path becomes testable, which unblocks the evidence G3
  requires, without waiting on a Windows certificate.
- Preview users install the build normally instead of being talked through
  `xattr` or System Settings.
- Each platform's trust state can be described truthfully and independently,
  rather than a policy choice ("previews are unsigned") masquerading as a
  technical constraint.
- The release gate keeps doing its real job — refusing an official build whose
  platform lacks credentials — instead of doubling as a trust switch.

### Negative

- **Existing unsigned previews cannot self-update to a signed preview.**
  Squirrel.Mac requires a valid signature on the running application before it
  will apply an update, so the unsigned-to-signed transition is a discontinuity.
  Anyone on a current macOS preview must download the next one manually, once.
- macOS preview builds now depend on Apple's notarization service. Build time
  grows, and an Apple service outage blocks preview publication rather than just
  official releases.
- Previews consume real signing credentials and notarization submissions, so a
  compromised CI secret has a wider blast radius than when previews were
  credential-free.
- SPEC-111 and PLAN-101 both need amendment, and the `unsigned-preview-*`
  rename touches artifact collection and the release asset validator.

### Neutral

- Windows preview behavior is unchanged until its certificate exists.
- Linux is unaffected.
- The three distribution modes (`official_packaged`, `preview_packaged`,
  `unofficial_packaged`) are unchanged; this decision does not add a fourth.

## Alternatives Considered

### Alternative 1: Promote previews to official releases

- **Pros**: no new concept; signing follows the existing release mode
- **Cons**: an official Windows release is still blocked for want of a
  certificate, so the promotion could not be applied uniformly. Official
  identity also means entering the `latest` feed and claiming release
  readiness, neither of which is true yet
- **Why rejected**: it conflates "installable" with "declared stable"

### Alternative 2: Keep previews unsigned and document the manual bypass

- **Pros**: no change to specification, workflow, or tests
- **Cons**: `Check for Update` remains completely non-functional on macOS
  because Squirrel.Mac refuses unsigned updates, so G3 can never be validated
  there. Every preview user performs a Gatekeeper bypass by hand
- **Why rejected**: it leaves SPEC-111 unable to satisfy its own verification
  gate

### Alternative 3: Sign previews but skip notarization

- **Pros**: avoids the notarization round trip and the dependency on Apple's
  service
- **Cons**: Gatekeeper requires a notarization ticket for a downloaded,
  quarantined application. Squirrel.Mac's signature check would pass, but the
  user could not get as far as running the build that would perform the update
- **Why rejected**: it fixes updating without fixing installation, which is the
  first of the two problems

## References

- [ADR-108: Use host-owned GitHub Release updates for official desktop builds](./108-use-host-owned-github-release-updates-for-official-desktop-builds.md)
- [SPEC-111: Packaged Desktop Update Surfaces and Release Contract](../specs/SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)
- [PLAN-101: Packaged Desktop Update Rollout](../plans/PLAN-101-packaged-desktop-update-rollout.md)
- [Electron: Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [electron-builder: Auto Update](https://www.electron.build/docs/features/auto-update/)

---

*Decision made: 2026-09-18*
*Decision makers: User, with Claude support*
