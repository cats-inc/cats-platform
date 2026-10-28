# Agency Agents as a Managed Skills Plugin

Date: 2026-09-28
Status: Suitable candidate for a small skills-only pilot; not installed or implemented
Related: [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md),
[SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md),
[PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md)

## Recommendation

Agency Agents is a better candidate than C2C for the first **content Plugin**: upstream's main
value is role guidance, domain workflows and delivery templates, and Cats already has a
foundation for skill validation/delivery, so no separate browser controller or upstream
execution engine is needed. We recommend distributing a fixed version of the upstream content
through Platform's Plugin management service, with Cats maintaining a thin format / metadata /
source adaptation, gradually reducing the manual rewriting and copy-maintaining of similar roles.

Here "reference" means **pinning and packaging upstream bytes at build time, and having Runtime
deliver the installed content at use time**. It is not reading GitHub main at runtime, depending
on a sibling checkout on a development machine, or running the upstream installer inside
Desktop. Installing this kind of Plugin adds optional roles/skills; it does not add a model
provider, tool permissions, persistent memory, or automatic Cat creation / task execution.

Later planning has added, in [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md) FR-09/10,
the general lifecycle, context revocation and source lock + recipe; upstream having no release
does not prevent building the Cats version from a fixed commit. Agency defaults to the content
path with no hooks, and Submodule is an optional development method.

The first candidate scope is recommended to be Code Reviewer and UX Researcher, coexisting
with Cats built-in skills at first. The existing built-in library cannot simply be replaced
wholesale: the source relationships, content scope and in-use skill IDs have not yet had a
migration inventory.
This round completed only a source-fit evaluation, and does not claim the package is
installable, output quality has improved, or the Plugin lifecycle has been delivered.

## Source and reproducibility

| Evidence | Pinned observation |
| --- | --- |
| Original upstream | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents); confirmed from the Git remote of the local checkout the user specified |
| Existing local reference | a local checkout of the upstream repository, detached `00fb28a4cf60a719363dce0de67fafc6301857ce`, commit date 2026-07-12; left as is |
| Current upstream reviewed | [`479193dcce1cf6432ce0f5aa230ab8cc739a8c6b`](https://github.com/msitarzewski/agency-agents/tree/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b), commit date 2026-09-27; separately cloned into an isolated research directory in the Cats workspace |
| Cats baselines | Platform `dec5af9b58939b973920d72f3d870390f501c2df`; Runtime `73f9def922e27e4b0bb3156db7a9b62026b22f5e` |

Recursively inventorying the 18 categories in the pinned `divisions.json` found 279 Markdown
agent files with a `name` frontmatter; this is this round's source inventory, not the number
of verified usable skills.
We did not run upstream convert/install, install its Desktop app, load its role instructions,
modify user settings, or test model quality. Upstream content was read here only as data, and
not as operating instructions for this agent.

The pinned [LICENSE](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/LICENSE)
is MIT; packaging should keep the original copyright/license and source. This round did not
inventory all external material the roles reference; a formal pilot must still check the
content, references and notices of the selected payload; this is not a release-license audit of
the whole repo.

## Existing Cats library and provenance limits

The Cats [Runtime library README](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/runtime-skills/README.md)
lists Agency as an authoring/reference source and forbids a runtime dependency on that sibling
repo. Runtime's [library-creation commit `03910ed`](https://github.com/cats-inc/cats-runtime/commit/03910ed048df9eb9455308208d69bb35dac43ce7)
established its own family/role taxonomy on 2026-03-24; only the later `91bba98` moved the
shipping content into `runtime-skills/`. The current inventory is 33 release packages, 36
including preview.

So what can be confirmed is that the design at the time was "an external role library may be
used as reference, and Cats owns the final content"; it cannot yet prove an actual file-by-file
port relationship. This round found no source mapping to an upstream revision / conversion
recipe, so we cannot assert that everything is an as-is port, nor deny that individual content
was inspired by upstream. The following is only a sample comparison of similar roles, not a
claim that they have a one-to-one derivation relationship.

| Current Cats skill | Comparable upstream role | Body lines: Cats / upstream | Replacement implication |
| --- | --- | --- | --- |
| `code-reviewer` | [Code Reviewer](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/engineering/engineering-code-reviewer.md) | 10 / 68 | Both focus on review; upstream also contains a persona, scoring markers and a reply format, so behavior is not equivalent |
| `ux` | [UX Researcher](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/design/design-ux-researcher.md) | 10 / 321 | The existing UX process guidance is not a full research role; it needs separate selection and evaluation |
| `advanced-programmer-frontend` | [Frontend Developer](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/engineering/engineering-frontend-developer.md) | 10 / 217 | Upstream also requires specific work such as editor extensions and WebSocket/RPC bridges; not in the first pilot batch |

Line counts are computed after removing the first frontmatter, normalizing LF and trimming; the
bodies of all three pairs differ. This is not a quality rating. Cats' companion, Runtime/repo
maintenance, delivery policy and governance skills also have their own purposes, and are not
handed over to an external role library just because an Agency Plugin is added.

## Thin integration path

```text
upstream @ fixed SHA + selected source paths + original license
  -> upstream SKILL.md conversion at build time
  -> Cats metadata / source map / digest / explicit bounded patches
  -> immutable managed Plugin artifact
  -> Runtime admits selected skills and reports source/version
  -> a Cat/session explicitly requests the installed role
```

Upstream's [converter](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/scripts/convert.sh)
already has the `agency-<slug>/SKILL.md` output shape for antigravity / osaurus / dsh,
containing name, description and the role body. This build-time step can be reused first,
without rewriting role content. The converter's
[body helper](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/scripts/lib.sh)
skips standalone `---` lines, and shell substitution also affects trailing newlines, so one
cannot claim from the docs alone that the converted body is byte-identical; the original text
should be archived and the allowed format normalization and content differences tested.

Its [Codex target](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/integrations/codex/README.md)
produces custom-agent TOML; this is not the Cats Runtime skill contract. Cats can serve Codex
and other supported providers through the existing Runtime skill delivery, without assuming
that TOML / global install path. Quality and delivery mode per provider still have to be
verified separately, and format support does not imply full compatibility.

| Boundary | Proposed handling |
| --- | --- |
| Source and maintenance | The Plugin recipe pins the upstream SHA, source path, source hash, converter revision and Cats envelope revision; an upstream update produces a reviewable new artifact, and the user side does not git pull on its own |
| Format and identity | Reuse or adapt upstream's SKILL.md output, adding Cats family/role/version/tags; Plugin ownership and the skill ID mapping are fixed in P0, and `agency-code-reviewer` and the like are only candidate slugs. Must not overwrite a built-in or manually installed skill of the same name |
| Content | The original text is traceable; Cats adds only the necessary metadata / host boundary. If a role needs heavy rewriting to be usable, exclude that role first, to avoid again becoming a hand-port to maintain |
| Scope and context | Two roles first, selected explicitly per session, without stuffing all 279 items into the prompt. A persona's memory/experience text neither grants real memory nor proves professional ability |
| Ownership | Platform's Plugin management service is responsible for download, install intent and version; the artifact / recipe provides the pinned content and source; Runtime manages verification, delivery, provenance and execution admission. Cats does not use the upstream installer to manage the user's global agent / skill directories |
| Disable and uninstall | Forbid new delivery and handle affected turns/contexts that carry the provenance; remove only Plugin-owned artifacts / projections. Keep user selections and history; a reference to a missing package shows unavailable and does not quietly fall back to a built-in role |

## Required Cats contract changes

The current [Runtime catalog](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/src/core/skills/catalog.ts)
scans SKILL.md under a selected root, validates names/content and rejects duplicate IDs /
symlinks; it already has foundations for fingerprint, delivery and requested/resolved/applied,
but it is not a completed managed Plugin source registry. Pointing `skillsRoot` at upstream,
stuffing Plugin files into the shipping library, or a successful global install does not count
as completing the integration.

Runtime's accepted
[ADR-018](../../../cats-runtime/docs/decisions/018-separate-skill-library-content-from-runtime-execution-engine.md),
[SPEC-013](../../../cats-runtime/docs/specs/SPEC-013-internal-skill-library-and-role-taxonomy.md)
and the library README currently limit it to a self-owned, locally shipped library. P0 should
explicitly extend this to "built-in content is maintained by Runtime, and a managed external
artifact is another admitted source; Runtime still owns delivery and execution".
This keeps the content/execution split, but the decision and exact contract must be updated in
the Runtime owner repo, and the old restriction cannot be quietly ignored. This round did not
change an accepted ADR or implement multi-source discovery.

Initially keep the built-in skill IDs; the new Agency roles use a different identity so the
user selects them explicitly. If it is later decided to retire an existing port / built-in
role, first inventory Cat settings, profiles, sessions, version / fingerprint refs, history
and user customizations. No silent rebinding; if the persisted format or reference requirements
change, provide validation, backup, atomic replacement and failure recovery under the version
policy. Adding an optional source does not by itself mean all data must be migrated.

## Pilot gates and next step

1. **Artifact:** pick only Code Reviewer / UX Researcher, pin the source and license, and verify
   conversion differences, YAML / names, referenced files, size and digest; do not run the
   upstream install, and do not modify a real user profile.
2. **Admission and delivery:** first fix the multi-source registration and revocation contract;
   in an isolated Runtime profile install, enumerate and select, recording
   requested/resolved/applied and upstream/plugin provenance; what is not installed cannot be used.
3. **Value:** with the same model and the same fixed review / UX questions, compare no skill,
   the Cats built-in and the Agency role; record findings, false positives, format / scope
   adherence and context cost separately, and do not treat a longer answer as a quality gain.
4. **Lifecycle:** after update, disable/remove and restart, an old generation must not be
   delivered again; an existing context cannot claim to be clean by deleting files, and manual
   skills and unrelated sessions are unaffected.

None of the above has been executed; this round only confirms that the candidate's architectural
direction is the more suitable. We recommend completing this skills-only pilot first, and not
using it to replace the verification of the other, standalone provider path. The documentation
and independent review results are recorded in PLAN-113.

*Last updated: 2026-09-28*
