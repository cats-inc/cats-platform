# ADR-088: Use Structured Artifact Declarations for Code Materialization

> Cats Code artifacts are materialized from structured agent/tool/system/user
> declarations that the product server validates and normalizes. They are not
> inferred by scanning the workspace or parsing JSON out of transcript prose.

## Status

Proposed

## Context

`Cats Code` now has a planned `Artifacts` sidebar. That raises a core product
question: how does Cats know that a coding assistant produced an artifact?

There are several possible signals:

- files changed in the selected workspace
- assistant prose that says "I produced a report"
- a JSON block embedded in chat text
- a runtime/tool payload such as preview URL, test report, screenshot, or patch
- a deliberate agent action that declares an artifact
- a user import or manual artifact marking

Only the last three are reliable enough to drive a durable artifact index.
Scanning `cwd` makes the sidebar noisy and provenance-poor: every source edit,
lockfile update, generated cache file, and temporary build output looks like a
potential artifact. Parsing JSON from transcript prose is also brittle because
chat text is user-visible, editable, and not an authority boundary.

The product needs a contract where agents can say "this is an output worth
recording" while the platform remains responsible for validation, anchoring,
normalization, and persistence.

## Decision

Cats Code will materialize artifacts through a structured artifact declaration
contract.

The accepted producer classes are:

- **agent-declared artifact**: a coding assistant calls a product/tool/API
  surface such as `record_artifact` or emits an equivalent structured runtime
  event.
- **tool-declared artifact**: a tool returns structured output that is already
  an artifact candidate, such as a preview URL, build output, test report,
  screenshot, patch bundle, or review report.
- **system candidate artifact**: the Code bridge derives a candidate from
  execution context such as run diff summary, known output path, test result,
  preview server, or delivery manifest.
- **user-imported artifact**: the user attaches, imports, uploads, or marks an
  object as an artifact.

Cats Code server, not the producer, is the materialization authority.

The server must:

1. validate the declaration,
2. map producer-specific artifact labels onto the current `CoreArtifactKind`
   vocabulary,
3. verify path / URL / anchor safety,
4. stamp authoritative provenance from the current conversation, task, run,
   workspace, actor, and product context,
5. decide whether the declaration becomes a `draft`, `ready`, or `published`
   `CoreArtifactRecord`,
6. write the artifact through the shared Core artifact persistence path.

The product must not create a durable artifact merely because:

- a Code sidebar entry was opened,
- a `+New code` conversation was created,
- a source file changed,
- a runtime session produced arbitrary stdout,
- an assistant included a JSON-looking block in a normal chat message.

Source file edits are workspace mutations. They become artifact evidence only
when a producer declares or the system records a higher-level output such as a
patch bundle, changed-files summary, implementation report, test report,
preview, build output, screenshot, or review report.

## Consequences

### Positive

- The `Artifacts` sidebar stays focused on reusable outputs rather than
  becoming a file explorer.
- Agent-authored outputs are first-class without trusting free-form transcript
  text as a persistence contract.
- Tool/runtime outputs and agent declarations share one normalization boundary.
- Provenance can be stamped consistently from server-side execution context
  instead of relying on whatever ids an agent remembered to include.
- Workspace containment, anchor existence, and artifact-kind allowlists can be
  enforced before durable records are written.

### Negative

- Agents and runtime/tool bridges need a new structured declaration surface.
- Some useful outputs will not appear in Artifacts until the producer learns to
  declare them or the system adds candidate detection.
- Candidate artifact handling needs product policy: some declarations can be
  auto-recorded, while ambiguous ones may need review before being promoted.

### Neutral

- Existing `CoreArtifactRecord` remains the durable record. The declaration is
  an input contract, not a new Core record family.
- The first implementation can represent candidate artifacts as
  `CoreArtifactRecord.status = 'draft'` plus metadata, or keep them in a
  product-local pending queue before promotion. A future Core status such as
  `candidate` would require a separate schema decision.

## Alternatives Considered

### Alternative 1: Scan the workspace for new or changed files

- **Pros**: Easy to understand and does not require agent cooperation.
- **Cons**: Noisy, weak provenance, hard to distinguish source edits from
  outputs, vulnerable to caches and generated directories, and expensive for
  large repos.
- **Why rejected**: It turns Artifacts into a filesystem diff view instead of a
  curated output index.

### Alternative 2: Parse JSON blocks from assistant transcript text

- **Pros**: Agents can emit declarations without a new tool/API surface.
- **Cons**: Brittle, user-visible, prompt-sensitive, hard to validate
  idempotently, and conflates conversation content with persistence commands.
- **Why rejected**: Transcript prose is not an authority boundary. Structured
  declarations must travel through a product/tool/API/event channel.

### Alternative 3: Trust agent declarations directly as Core artifacts

- **Pros**: Simple producer implementation.
- **Cons**: Lets the agent choose unsafe paths, incorrect anchors, unsupported
  kinds, misleading status, or fabricated provenance.
- **Why rejected**: The platform must remain the authority for validation and
  materialization.

## References

- [SPEC-092: Code Artifact Declaration Contract](../specs/SPEC-092-code-artifact-declaration-contract.md)
- [PLAN-081: Code Artifact Declaration Rollout](../plans/PLAN-081-code-artifact-declaration-rollout.md)
- [SPEC-091: Cats Code Workspace and Artifact Sidebar](../specs/SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [PLAN-064: New Code MVP Task, Run, and Artifact Materialization](../plans/PLAN-064-new-code-mvp-task-run-artifact-materialization.md)
- [ADR-081: Canonicalize the Core record taxonomy as Interaction / Planning / Execution](./081-canonicalize-three-tier-core-record-taxonomy.md)

---

*Decision made: 2026-04-29*
*Decision makers: middl, Codex*
