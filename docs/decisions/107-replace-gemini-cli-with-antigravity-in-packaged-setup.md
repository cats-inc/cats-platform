# ADR-107: Replace Gemini CLI with Antigravity CLI in packaged setup and shared provider catalog

> Treat the upstream Gemini-to-Antigravity swap as a full replacement across
> packaged installer scripts, desktop host wiring, shared provider catalog
> data, and smoke tests — not as an additive provider.

## Status

Proposed

## Context

The `environment-bootstrap` installer suite (the upstream this project bundles into Cats Desktop packaging) committed two coordinated changes on 2026-05-24:

- `b273f63a` — added native Antigravity CLI installers (`Install-AntigravityCLI.ps1`, `install-antigravity-cli.sh`) for all three OSes, removed `@google/gemini-cli` from npm install lists, and switched `Check-Installation` to probe the new `agy` binary.
- `5725e637` — reordered orchestration so the new sequence is Claude Code → Antigravity → Cursor Agent → ...

`cats-platform` carries a substantial Gemini surface today:

- Three native installer wrappers: `scripts/{windows,linux,macos}/Install-Gemini.{ps1,sh}` that call the npm-helper to install `@google/gemini-cli`.
- Desktop host orchestration: `desktop/host/cliInventoryProbe.ts`, `desktop/host/bootstrapPage.ts`, `desktop/host/contracts.ts`, `desktop/host/packaging.ts`, `desktop/host/setupAssets.ts` all enumerate `gemini` as a known CLI with display label, native-installer suffix, packaged asset id, and bundled-script registration.
- Packaged-setup smoke tests on all three OSes (`Test-WindowsInstallerSmoke.ps1`, `test-macos-package-smoke.sh`, `test-linux-package-smoke.sh`) assert that the Gemini installer assets are bundled into the packaged app.
- Skills-sync tooling (`Sync-AgentSkills.ps1`, `sync-agent-skills.sh`) treated `gemini` as a valid `--agent` value and synced to `.gemini/skills/` when this was written. That row has since been removed by `cc2d38de` ("remove unverified platform skill sync target") under PLAN-100; all three helpers now accept only `claude` and `codex` (`[ValidateSet("claude", "codex")]`, `agents=(claude codex)`) and target only `.claude/skills` and `.agents/skills`. Verified 2026-08-28. The helpers are separately inert as written — each iterates only the direct children of `skills/` and requires a `SKILL.md` in that child, while this repository's library is family-organized one level deeper (`skills/orchestration/a2a-handoff/SKILL.md`), so every run reports `No skills found` and returns without writing a mirror.
- Shared provider catalog data (`src/shared/providerCatalogData.ts`, `src/shared/providerCatalogInstances.ts`) registers `gemini` as a provider family with a Gemini-3.x model list. The Antigravity replacement keeps only a provider-default sentinel until raw `agy` model ids are proven. The runtime dashboard and playground currently duplicate comparable provider/model data in `cats-runtime`, so this migration requires runtime to mirror the platform catalog values explicitly. Automated cross-package catalog handoff is outside this slice.
- Companion shell helpers (`scripts/{macos,linux}/node-cli-common.sh`, `scripts/windows/_NpmCliInstaller.ps1`, `scripts/{macos,linux}/upgrade-cli-tools.sh`) mention Gemini in CLI catalogs and upgrade loops.
- `scripts/README.md` and skills-sync helper docs reference the Gemini installer / `.gemini/skills` story. Repo-root and subproject `GEMINI.md` files are agent-governance files, not packaged-setup assets.

The owner has decided Antigravity CLI is the native replacement and Gemini CLI will be deprecated. Per project-wide policy (`feedback_no_backwards_compat`), this project has not shipped and does not preserve legacy migration paths.

The question is whether `cats-platform` should:

- keep Gemini packaged setup wiring and add Antigravity in parallel,
- swap Gemini for Antigravity in place across packaging + shared catalog + smoke tests + skills tooling,
- or split the two (swap packaging now, defer catalog/skills).

## Decision

`cats-platform` will replace Gemini CLI with Antigravity CLI in the packaged Desktop setup, in the shared provider catalog, and in the skills sync tooling, as a single coordinated change paired with cats-runtime ADR-032.

Concretely:

1. The three native installer wrappers (`Install-Gemini.{ps1,sh}`) are replaced by `Install-Antigravity.{ps1,sh}` wrappers. Windows keeps Cats Desktop's PowerShell helper lifecycle (`-CheckOnly` / `-Apply` / `-Upgrade` / `-Force` / `-Uninstall` / `-DryRun` / `-Json`). macOS/Linux publish the bash-style lifecycle (`--check` / `--apply` / `--upgrade` / `--force` / `--uninstall` / `--dry-run` / `--json`) while accepting the PowerShell-style bridge aliases as compatibility input. The wrappers invoke Google's official installer and port environment-bootstrap's refresh behavior by deleting the existing `agy` binary before upgrade / force.
2. The desktop host CLI inventory (`cliInventoryProbe.ts`) replaces the `gemini` entry with `antigravity` across binary name, display label, and native-installer suffix.
3. The desktop host packaging metadata (`packaging.ts`, `setupAssets.ts`) replaces the `windows/linux/macos-gemini-native-installer` asset ids and `Install-Gemini.{ps1,sh}` paths with `antigravity` equivalents. `setupAssets.ts` must not string-swap Antigravity into the existing npm-provider tuples, because those tuple-generated rows describe npm-global / repo-owned npm helper behavior. Antigravity gets explicit standalone provider-installer registrations whose notes describe user-scoped native binary install.
4. The desktop bootstrap onboarding page (`bootstrapPage.ts`) replaces `gemini` in its provider list, display label map, and `ONBOARDING_COLLAPSED_PROVIDER_IDS` with `antigravity`. The position in the provider list matches the upstream `Claude Code → Antigravity → Cursor Agent` ordering.
5. The Windows setup readiness check (`Check-WindowsSetupReadiness.ps1`) replaces the `gemini` entry with `antigravity`.
6. The packaged-setup smoke tests on all three OSes replace their Gemini-asset assertions with Antigravity-asset assertions.
7. The shared provider catalog (`src/shared/providerCatalogData.ts`, `src/shared/providerCatalogInstances.ts`) replaces the `gemini` provider family with `antigravity`. Until explicit Phase 0 evidence proves raw `agy` model ids, the bundled catalog exposes only `antigravity-default` as a provider-default sentinel. Official product documentation may be recorded as display-name evidence, but those display names must not become executable model values without a CLI model-list command, a documented config surface, or a smoke run proving the id is accepted. Existing Gemini model ids may move under `antigravity` only with that evidence.
8. Skills sync (`Sync-AgentSkills.ps1`, `sync-agent-skills.sh` on macOS and Linux) gains no `antigravity` `--agent` value and no skills target. The probe this point made a precondition was run on 2026-08-28 against agy 1.1.20 and the default action it named is correct. A scratch workspace was seeded with both candidate paths — `<workspace>/.gemini/skills/probe-gemini/SKILL.md` and `<workspace>/.antigravity/skills/probe-antigravity/SKILL.md`, each holding a unique codeword — and a single print-mode turn asked agy to enumerate the skills in its context. It returned 38 skills with absolute paths, drawn from exactly two user-level roots, `~/.gemini/antigravity-cli/builtin/skills/` and `~/.gemini/config/plugins/<plugin>/skills/`, both since verified on disk. Neither probe skill appeared at its alphabetical position. Agy discovers no project-level skill directory on either candidate path, so there is nothing for a repository-level sync helper to write. Delivering a repository-owned skill to agy would require the plugin route under `~/.gemini/config/plugins/`, which this decision does not adopt. The `gemini` row this point proposed removing does not exist in this repository's helpers (see Context).
9. Shell helpers and READMEs (`node-cli-common.sh`, `_NpmCliInstaller.ps1`, `upgrade-cli-tools.sh`, `scripts/README.md`) lose their Gemini references.
10. `GEMINI.md` files are not renamed or deleted by this migration, but the reason recorded here was incomplete. They are not merely governance files left over from a retired CLI: `agy` reads `GEMINI.md` and `AGENTS.md` as context files, which a string probe of the agy executable confirms — the two names sit adjacent in its table at several offsets. The filename cannot change because it is the name agy looks for. What each `GEMINI.md` must not keep is its skills paragraph, which claims discovery from `.gemini/skills/<name>/SKILL.md` and is false per point 8. Those corrections are owned by agy under the same agent-file rule that governs `CLAUDE.md` and `CODEX.md`, and are out of scope for this migration.

Coordination with cats-runtime ADR-032 / SPEC-026 / PLAN-033 is required: the platform catalog defines the product-side provider/model values, while the runtime currently has separate hardcoded dashboard/playground data. Platform Phase 1 must land before runtime UI Phase 4 so runtime can mirror the same sentinel or later probe-backed values.

## Consequences

### Positive

- One Google-family CLI in the packaged setup, one install path, one diagnostics surface, one smoke test fixture.
- Eliminates the `@google/gemini-cli` npm dependency from the bundled installer matrix.
- Platform catalog becomes the product-side source of truth, and runtime PLAN-033 is forced to mirror it consciously. This avoids an accidental stale runtime playground list without inventing an undefined cross-package catalog handoff.
- Desktop bootstrap onboarding ordering matches environment-bootstrap's `Claude Code → Antigravity → Cursor Agent` orchestration.

### Negative

- Touches packaging, host code, shared catalog, smoke tests, skills tooling, shell helpers, and docs in one slice.
- Cross-repo coordination with cats-runtime is unavoidable — the shared catalog handoff is on the critical path for both repos.
- ~~Skills tooling has an open question on `.antigravity/skills/` that cannot be resolved without probing `agy` behavior.~~ Resolved 2026-08-28 by the probe recorded in decision point 8: agy has no project-level skill discovery, so the skills-tooling slice reduces to a documentation correction and this is no longer on the critical path.

### Neutral

- The `_NpmCliInstaller.ps1` and `node-cli-common.sh` helpers remain in use for other npm CLIs (Codex, Copilot, OpenCode, Kilo, Auggie, Pi); only their Gemini-specific comments and catalog rows change.
- `scripts/README.md` is the most touched documentation file; the changes are mechanical replacements plus a one-paragraph note explaining the swap.

## Alternatives Considered

### 1. Keep Gemini installer wiring and add Antigravity in parallel

- **Pros**: No installer-script deletion; users can pick either CLI.
- **Cons**: The upstream `Install-Gemini` flow no longer has a working npm package (`@google/gemini-cli` is being abandoned). Keeping the wrapper preserves a script that cannot install anything.
- **Why rejected**: A non-functional installer is worse than no installer.

### 2. Swap packaging only, defer shared catalog and skills tooling

- **Pros**: Smaller slice; easier to land.
- **Cons**: The platform catalog and runtime playground would drift; leaving `gemini` in one surface while the installer is `antigravity` produces a model list for a CLI no one can install. Skills tooling has the same drift problem.
- **Why rejected**: The drift cost is paid every time a developer touches Settings or the playground; better to land the swap atomically.

### 3. Rename Gemini-the-id to Antigravity-the-id everywhere as a string replace

- **Pros**: Trivially mechanical.
- **Cons**: Some surfaces (smoke test asset ids, ACP profile family, session storage path) are not just labels — they encode protocol or filesystem contracts that differ between the two CLIs.
- **Why rejected**: A blind rename would falsely assert behavioral equivalence at every seam.

## References

- [ADR-013: Ship cats-inc as an executable, self-hosted npm app](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
- [ADR-021: Keep packaged setup and provider installation in the host](./021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-044: Adopt Windows x64 Electron plus self-hosted npm as initial distribution strategy](./044-adopt-windows-x64-electron-plus-self-hosted-npm-as-initial-distribution-strategy.md)
- [ADR-046: Drive packaged setup through runtime bootstrap APIs](./046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [SPEC-110: Antigravity CLI in packaged setup and provider catalog](../specs/SPEC-110-antigravity-cli-in-packaged-setup-and-provider-catalog.md)
- [PLAN-100: Replace Gemini CLI with Antigravity CLI in packaged setup](../plans/PLAN-100-replace-gemini-cli-with-antigravity-in-packaged-setup.md)
- cats-runtime ADR-032 (runtime side of the same migration) — its open item on a
  `.antigravity/skills/` directory deferred to point 8 above, now closed
- cats-runtime ADR-036 (separate repository-maintenance skills from
  runtime-delivered skills) — ran the point 8 probe and reaches the same
  conclusion. That ADR owns the canonical developer-skill source; this one owns
  the `--agent` enum and the packaged-setup surface.
- environment-bootstrap commits `b273f63a` and `5725e637`

---

*Decision made: 2026-05-24*
*Decision makers: User, with Claude support*
