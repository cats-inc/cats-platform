# ADR-154: Deliver optional native dependencies as host-managed feature packs

## Status

Proposed — 2026-11-16, at the owner's request. Documentation only: no code,
package, artifact, release or version change is authorized by this record.
"Feature pack" is a working name; see [Decisions to confirm](#decisions-to-confirm).
Linux dictation is the proposed pilot.

## Context

### Some dependencies of Cats' own features belong to none of the four categories

[ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md) sorts the
ecosystem into Runtime, Platform/Products, Apps (opened by the user) and Plugins
(optional capabilities consumed by Platform/Runtime). The contributions a Plugin
can make ([SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md) FR-02) are a
provider/agent target, MCP/tools, skills and settings. The delivered Plugin
lifecycle is built for content that reaches a model: per-Cat selection, a Runtime
lease and generation fence, conversation exposure and impact preview. Only the
Agency skills pilot is delivered.

Several features need a native executable or data file that no Cat selects and
no model sees. Host code runs it:

- **Linux dictation.** Desktop and Bot run native speech helpers on macOS and
  Windows ([ADR-079](079-use-platform-native-stt-with-linux-toast-fallback.md),
  [SPEC-084](../specs/SPEC-084-composer-voice-input-via-platform-native-stt.md),
  [Bot ADR-018](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/018-dictate-through-native-speech-helpers.md)).
  Linux has no OS speech engine. Desktop's Linux composer falls back to Web
  Speech, which never transcribes in Electron. Bot hides its button.
  [ADR-085](085-bundle-whisper-cpp-on-linux-for-composer-voice-input.md) proposed a
  whisper.cpp helper with the multilingual `ggml-base` model (~140 MB, per
  ADR-085) inside the Linux installer. It was rejected on 2026-04-28 because its
  build required a git submodule. Three concerns were named: contributor
  ceremony, an external trust boundary, and opaque pointer review. It asks a
  successor to use plain source vendoring or a checksum-verified build-time fetch.
  Its Alternative 2 also rejected a first-run model download: "the team prefers
  ready-to-use behavior; the +140 MB delta is acceptable."
- **FFmpeg/FFprobe.** Runtime decodes video sources with them and starts without
  them ([Runtime ADR-053](https://github.com/cats-inc/cats-runtime/blob/main/docs/decisions/053-extend-media-receipts-with-immutable-references.md)
  amendment). Desktop does not ship them. Bundling needs per-OS and
  per-architecture binaries, and `ffmpeg-static` carries GPL-3.0 obligations;
  that ADR leaves shipping them to a separate release decision.
- **ngrok** runs as an SDK worker of the single host-owned ingress
  ([ADR-139](139-manage-one-desktop-remote-ingress.md),
  [SPEC-130](../specs/SPEC-130-desktop-managed-remote-access.md)). It is listed
  here only so that this record can exclude it.

Making these Plugins would add a per-Cat selection and context fences that mean
nothing for a binary only host code runs. They are not setup prerequisites or
AI tools either ([ADR-144](144-install-git-as-a-desktop-setup-prerequisite.md),
[ADR-148](148-manage-ai-tools-in-settings-with-the-first-run-wizards-rows.md)).
Git and the AI CLIs are installed by helpers into the user's system and shared
with other software. Settings may update or uninstall an AI CLI (Git has no
uninstall mode), but Cats does not pin those bytes or keep them private.

### Repository direction

[ADR-142](142-publish-reusable-platform-packages-for-independent-products.md) and
[ADR-143](143-separate-product-repositories-after-platform-contracts-stabilize.md)
(both Proposed) move Desktop and Mobile application composition out of
`cats-platform`. `cats-platform` keeps the shared packages, the server and Web
entry, App SDK install/load, and reusable host integrations.
[SPEC-134](../specs/SPEC-134-reusable-platform-packages-and-consumer-boundaries.md)
names a Node-only `@cats-inc/platform-host` for native-helper adapters whose
resources are declared per OS and architecture. It also states that a native
helper a headless Bot core needs belongs behind that Node boundary. That package
does not exist yet. Bot may import only the public `@cats-inc/platform-ui-web`
entries today, and it ported Desktop's voice controller and helpers by copy
(Bot ADR-018).

## Decision

### 1. A feature pack is a host-managed native dependency

A feature pack is an optional, versioned set of native files for one OS and
architecture, such as executables, models and data. A host feature runs or reads
it as an implementation dependency. It is not a fifth ecosystem category. Users
meet it as "what this feature needs" and in a Settings list.

| Kind | Who consumes it | Removal needs |
| --- | --- | --- |
| App | The user opens it | App lifecycle (ADR-121) |
| Plugin | Runtime, Cats, a model | Fences, impact preview, session revocation (ADR-122) |
| Setup prerequisite or AI tool | The user's system, other software and Cats | System-level helper action; Git has none (ADR-144, ADR-148) |
| Feature pack | Host code of one product | Stop the feature's process, delete owned files |

Two tests separate them:

- If removing it requires reasoning about model context or sessions, it is a
  Plugin.
- If other software on the machine may use it, it is a setup prerequisite.

A feature pack's bytes are private to one product and pinned by that product.

### 2. Ownership follows ADR-143

- **The contract is shared; the library is the target.** The shared contract is
  three artifacts: the pack format, the lock entry and the helper protocol. The
  pack-manager library (acquire, verify, stage, activate, resolve, remove) and the
  voice controller target `@cats-inc/platform-host`. Until that package is
  published, each product may implement the same contract, as Bot ADR-018 ported
  its helpers. Converging on the library is later work, not a pilot gate.
- **A producer builds packs** from pinned upstream source. It owns the source
  lock, license notices, per-architecture CI builds and build receipts. The
  default is `cats-plugins`, extending its ADR-001 pipeline beyond text content.
  That repository decides with its own ADR.
- **Each product selects and presents.** Desktop (today `desktop/` here, later
  `cats-desktop`) and Bot choose which packs and exact versions they use, and
  own the consent UI, IPC/preload wiring and data root.
- **Web and server.** The browser composer is unchanged and keeps its Web
  Speech path. The Web renderer never receives pack paths or bytes. The server
  does not download packs.
- **Runtime downloads nothing.** A Runtime feature that needs a pack receives
  an explicit path from its host. Any such Runtime input is that repository's
  decision.

### 3. Acquisition and trust

- A product's lock file pins each pack: identifier, version, OS, architecture,
  source URL, byte size and SHA-256. It is reviewed in that product's release.
  The host downloads only locked bytes and rejects any size or hash mismatch. It
  never follows "latest", and never accepts a URL or path from the renderer. A
  hash proves the bytes match the lock. Trust comes from reviewing the lock.
- A product delivers a pack in one of two ways, using the same lock and the
  same verification:
  - **On demand.** Nothing downloads at install or startup. The first use of
    the feature asks for consent and names the pack, its size, its source and
    its licenses.
  - **Bundled.** The installer carries the pack.

  Which way to use is a per-product release choice, made per pack.
- Files live under the product's data root in a per-version directory. They are
  staged, verified, then renamed into place. An ownership receipt records what
  was written. Removal deletes only receipt-owned paths, after the feature's
  process has stopped. A missing or damaged pack makes the feature report itself
  unavailable and offer a fresh download. Pack versions change only with a
  product release.
- Desktop and Bot have separate data roots
  ([Bot ADR-007](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/007-give-cats-bot-its-own-identity-and-data-root.md)),
  so the pilot does not share files between them.
- On macOS and Windows a downloaded executable needs a signing and
  notarization policy before any pack ships there. The pilot is Linux only.

### 4. Pilot: Linux dictation

- **Pack.** A whisper.cpp helper and a multilingual Whisper model for Linux x64
  and arm64, the Desktop Linux targets of
  [ADR-130](130-ship-per-architecture-windows-and-linux-desktop-installers.md).
  The producer fetches whisper.cpp at a pinned commit with checksum verification.
  `cats-platform` gains no submodule and no whisper.cpp source.
- **Helper.** [SPEC-087](../specs/SPEC-087-linux-composer-voice-input-via-bundled-whisper-cpp.md)
  is cancelled with ADR-085. A successor SPEC carries over its helper and host
  requirements, minus packaging and build:
  - the existing JSON-lines protocol with `mode: 'on-device'`;
  - PulseAudio/PipeWire capture;
  - the model preloaded before `ready`;
  - the host-owned recording cap with `limit_warning` and `processing`;
  - the longer Linux stop cleanup.

  `limit_warning` and `processing` are additive to the shared voice contract.
  The Linux helper's bridge source lives with the producer (cats-plugins
  ADR-002, proposed). The macOS and Windows helpers stay in the product
  repositories, as today.
- **Gates before the model is chosen.** `ready` includes model load, and both
  controllers time out at 3 seconds. SPEC-087 Req 14 estimates 0.3–1.5x
  real-time, ~9 to ~45 seconds for a capped utterance, without naming the
  slowest supported device. Measure ready time and capped transcription time on
  the slowest supported Linux arm64 device, then pick the model and
  per-platform timeouts.
- **Delivery.** The proposal is on demand. This reverses ADR-085's
  ready-to-use preference so that Linux users who never dictate do not carry
  the model. The owner confirms or keeps bundling (D6).
- **Desktop.** The Linux composer exposes the native voice bridge instead of
  the Web Speech fallback. Delivered on demand, clicking the button without the
  pack opens the consent prompt, and dictation starts after installation.
- **Bot.** Bot adopts the same pack, lock entry and protocol through its own ADR,
  which amends Bot ADR-018 point 3. Shipping Bot's Linux dictation must not wait
  for `@cats-inc/platform-host`.
- **Not in the pilot.** Streaming recognition, a locale picker, and whisper on
  macOS or Windows are out of scope.

### 5. Explicitly not feature packs now

- **ngrok** stays in the host-owned ingress, where it already ships as an SDK
  worker. ADR-139 and SPEC-122 ACMP-12 want one ingress that the host owns.
- **FFmpeg/FFprobe** are a candidate second pack. They need the owner's
  release and licensing decision, and a Runtime path input. Nothing is decided
  here.
- **Agency and other skills** remain Plugins. Setup prerequisites remain as
  ADR-144 and ADR-148 define them.
- There is no pack catalog or market, no third-party packs, no dependency
  graph, and no update outside product releases.

### 6. Relationship to existing decisions

- This record adds a host-internal kind beside ADR-122's categories. It does not
  change the Plugin contract.
- If accepted, it amends ADR-079 for Linux only. ADR-079 excluded bundled local
  engines and download-on-first-use; Linux replaces the Web Speech toast
  fallback with a pack. macOS and Windows are unchanged.
- ADR-085 stays rejected. This record reuses its helper design and, with
  on-demand delivery, reverses its Alternative 2. It answers ADR-085's rejection
  reasons:
  - No submodule, so no contributor ceremony.
  - The external trust boundary remains. It moves to a producer repository,
    where a changed commit or hash is an explicit, reviewable lock change.
  - Review is a lock diff plus the producer's upstream comparison, not a bare
    gitlink.
- Persisted data: packs add a new namespace with its own receipt schema. No
  existing schema changes.

## Consequences

### Positive

- Linux gets on-device dictation without growing every installer or adding a
  submodule.
- A native dependency gets one acquisition, verification and removal pattern
  instead of per-feature scripts.
- Desktop and Bot can share one artifact and protocol before they share a
  library, consistent with ADR-143's staging.

### Negative

- Download-on-first-use needs network access at first use, consent UI and
  failure handling that bundled helpers did not.
- A producer pipeline for native per-architecture builds is new work. Today's
  producer has packaged only text content.
- Desktop and Bot each keep their own copy of a pack on a machine with both.
- Hosting packs is publication, a release responsibility the owner must assign.

### Neutral

- Until `@cats-inc/platform-host` exists, the contract is enforced by tests in
  each consumer rather than by one library.
- Whisper latency on low-end arm64 may force a smaller model or a shorter cap;
  the gate in §4 decides.

## Alternatives Considered

### Alternative 1: Make them Plugins

- **Pros**: Reuses the delivered inventory and ADR-122 vocabulary.
- **Cons**: Per-Cat selection, leases and fences are meaningless here. Users
  would see binaries beside skills.
- **Why rejected**: The Plugin lifecycle exists for content that reaches a model.

### Alternative 2: Bundle in every Linux installer (ADR-085)

- **Pros**: Works offline from first launch, with no consent or download
  states. ADR-085's team preferred this.
- **Cons**: Adds the model to every Linux installer, including for users who
  never dictate.
- **Why not proposed for the pilot**: The owner decides (D6). §3 allows either
  delivery under the same lock, so choosing bundling keeps the rest of this
  record.

### Alternative 3: Use system-installed engines

- **Pros**: Cats distributes nothing.
- **Cons**: Cats cannot pin or verify the bytes. Availability and versions vary
  by distribution, and the helper protocol would need per-engine adapters.
- **Why rejected**: Not dependable for the pilot.

### Alternative 4: Cloud speech recognition

- **Pros**: No local model.
- **Cons**: Sends audio off the machine and needs a Cats-owned key or service.
- **Why rejected**: ADR-079 already excludes app-managed cloud STT.

### Alternative 5: Each product builds its own pack manager and helper

- **Pros**: No cross-repository coordination.
- **Cons**: The copying that SPEC-134 wants to end, including divergent
  verification logic.
- **Why rejected**: Rejected as the target. Accepted only as the interim in §2.

## Decisions to confirm

- **D1 — Name.** "Feature pack" is a working name. "Component" is already used by
  SPEC-122 App components and by UI components. Alternatives are "native
  add-on", "on-demand resource" or another term.
- **D2 — Producer.** Recommended: `cats-plugins`, extended by its own ADR-002
  (proposed) with a separate pack recipe kind and native build pipeline.
  - Desktop and Bot both consume the packs, so the producer cannot be either
    product repository.
  - A new repository would duplicate the source-lock, license and artifact
    governance for one pilot.
  - Revisit a separate producer when the first macOS or Windows pack needs
    signing secrets, or when a GPL pack such as FFmpeg adds source-offer duties.
- **D3 — Hosting.** Recommended: GitHub Releases on `cats-plugins`, which is
  public, so hosts download without credentials.
  - One release per pack version, with a per-pack tag such as
    `linux-stt-v0.1.0`. Its assets are the per-architecture archives, SHA-256
    sidecars, the build receipt, the upstream source archive and the notices.
  - Assets that any released product lock references are never replaced or
    deleted; a fix ships as a new pack version.
  - The Agency precedent of vendoring the archive into this repository does not
    fit: GitHub rejects files over 100 MB in Git, and ADR-085 sized the model at
    ~140 MB.
  - This is the first publication from `cats-plugins`, which has no release
    workflow or publishing secrets. It needs the owner's authorization under
    that repository's release policy.
- **D4 — Model.** Chosen after the §4 arm64 measurement; ADR-085's `ggml-base`
  is the starting candidate.
- **D5 — Data reset.** Whether Platform data reset (ADR-135) keeps downloaded
  packs, as it keeps installed tools. The proposal is to keep them.
- **D6 — Pilot delivery.** On demand, as proposed, which reverses ADR-085's
  ready-to-use preference; or bundled in the Linux installers.

## References

- [ADR-079: platform-native STT with Linux toast fallback](079-use-platform-native-stt-with-linux-toast-fallback.md)
- [ADR-085: bundled whisper.cpp on Linux (rejected)](085-bundle-whisper-cpp-on-linux-for-composer-voice-input.md)
- [SPEC-087: Linux composer voice input via bundled whisper.cpp](../specs/SPEC-087-linux-composer-voice-input-via-bundled-whisper-cpp.md)
- [ADR-122: managed Plugins](122-adopt-managed-plugins-for-upstream-capabilities.md) and [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)
- [ADR-142](142-publish-reusable-platform-packages-for-independent-products.md), [ADR-143](143-separate-product-repositories-after-platform-contracts-stabilize.md) and [SPEC-134](../specs/SPEC-134-reusable-platform-packages-and-consumer-boundaries.md)
- [ADR-135](135-make-runtime-data-reset-explicit-and-preserve-installed-tools.md), [ADR-139](139-manage-one-desktop-remote-ingress.md), [ADR-144](144-install-git-as-a-desktop-setup-prerequisite.md)
- [Bot ADR-018](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/018-dictate-through-native-speech-helpers.md)
- [Runtime ADR-053](https://github.com/cats-inc/cats-runtime/blob/main/docs/decisions/053-extend-media-receipts-with-immutable-references.md)
- [cats-plugins ADR-001](https://github.com/cats-inc/cats-plugins/blob/main/docs/decisions/001-pinned-upstream-producer.md)

---

*Proposed: 2026-11-16*
*Decision makers: Owner (pending)*
