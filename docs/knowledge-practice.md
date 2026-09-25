# Preview knowledge practice

This is an on-demand developer workflow for proposing and independently checking
product knowledge. It does not train model weights, start a scheduler, change an
installed Desktop, or add a release endpoint. The tools directory is outside the
npm/Desktop asset lists. Ordinary release Catlas and Orchestrator continue using
the production knowledge loader and their configured provider/model.

Implementation/checkpoints: [PLAN-109](plans/PLAN-109-cats-self-development-and-catlas-practice.md).
Requirements: [SPEC-117](specs/SPEC-117-cats-self-development-and-catlas-practice.md).

## Try the fixture workflow

Build Platform server/host and the paired Runtime first. From Platform, select a
new private output directory whose parent already exists:

```text
node tools/knowledge-practice/cli.mjs fixture-demo --runtime-root <preview Runtime checkout> --out <new private directory> --consumer catlas
node tools/knowledge-practice/cli.mjs inspect --run <private directory>/private-run
```

The demo performs no provider calls. It tests actual product-knowledge assembly
with ten named synthetic cases and three fresh resets for each baseline/candidate
pair (60 attempts). Four public sample cases exercise the held-out plumbing;
because the sample is public, it is **not a protected production holdout**.
Successful fixture evidence is explicitly ineligible for production promotion.
No observed improvement here establishes live model or UI competence.

Use `--consumer orchestrator` in a separate new directory for its actual
capability set, roles and operation scopes. Omitting `--consumer` retains the
cross-role selection fixture; its combined required capabilities deliberately
cannot export to either single production consumer. Do not weaken a consumer's
capability list to make a fixture load.

Generated fixtures use the checkout's Platform version and matching minor range
for both the exercise and candidate knowledge. Shipped Catlas/Orchestrator bundles
retain explicit reviewed ranges: when preparing a new minor, verify those assets
against the new consumers and update their ranges and bundle revisions. Fixture
version derivation does not automatically approve product knowledge for a new minor.

The source/preview Runtime manifest must permit practice. Missing/release
eligibility rejects admission. This developer command explicitly selects its
Runtime artifact; it does not claim to identify an installed/running controller.

## Roles and private state

The operator supplies an independent evaluator identity, a fixed baseline,
exercise JSON and a trusted self-contained evaluator module. The author gets
only the declared author workspace and admitted training inputs. Run state,
evaluator inputs and this tool must remain outside that author's physical write
scope; junction/alias overlap is rejected. Give managed sessions the corresponding
actual Runtime tool/filesystem grants. A role ID, path declaration or local file
signature does not itself impose an OS sandbox or authenticate a different human.

Run-local authenticated receipts reject fabricated/modified JSON and bind the
frozen engine, evaluator, exercise, baseline and candidate. Protect the run key
and trusted tool from the author. An operator who can rewrite both has the same
authority as the evaluator; signatures do not protect against that operator.

Admission creates a new directory and uses exclusive, flushed writes. Existing
roots are not reused or deleted. Each attempt records intent before dispatch and
a terminal receipt afterward. An interrupted or partially written record is
preserved and cannot be interpreted as success. `inspect` does not execute work;
an already-started evaluation cannot be silently replayed. Inspect remote/owned
state and reconcile cleanup before explicitly admitting another run.

## Draft and admit

Drafting can use already authorized source-fix evidence and never invokes a model:

```text
node tools/knowledge-practice/cli.mjs candidate --draft <sanitized draft.json> --out <new candidate.json>
node tools/knowledge-practice/cli.mjs admit --out <new run directory> --author-root <author workspace> --exercise <exercise.json> --baseline <bundle.json> --evaluator <evaluator.mjs> --evaluator-id <independent stable ID> --runtime-root <preview Runtime checkout>
node tools/knowledge-practice/cli.mjs evaluate --run <run directory> --candidate <candidate.json>
```

The candidate envelope is `schemaVersion: 1`, `state: "unverified"`, a draft and
its digest. The draft contains `id`, `authorId`, sanitized `evidenceRefs`, at least
one `counterexamples` entry and `knowledge`. Knowledge has a revision, Platform
range, required capabilities and schema-2 bilingual entries with roles, surfaces,
topics and required operation versions. It has no verification date or authority
to become an active bundle. The production loader checks a temporary projection;
the validation sentinel date is never a promotion claim.

The public fixture generator is an executable shape example. Real evaluation
must use separately protected inputs, independently sourced expected outcomes
and an evaluator that checks the actual product result. Do not copy its public
cases and label them a production holdout.

## Frozen evaluator contract

Exercise schema 1 specifies an ID/revision, `evidenceMode` (`fixture` or `product`),
Platform version/capabilities, `repeats` (3–6), a budget and one target metric.
There must be 10–32 unique scenarios and at least four held out from the author.
Each declares a bounded synthetic/admitted fixture, production knowledge context
inputs, and unique checks with an ID, `correctness`/`policy` kind, critical flag,
JSON-pointer path and expected JSON value. Every scenario needs a critical check.
Expected values and held-out case definitions are never supplied to the candidate
author or as fields in the evaluator's model input.

The trusted module exports:

```js
export async function attempt({ fixture, fixtureRoot, resetId, context, signal }) {
  // Independently observe the admitted product harness; honor cancellation.
  return {
    observed: { /* bounded facts checked by the frozen engine */ },
    usageTokens: null, // measured nonnegative integer, or unknown
    interventions: 0,
    evidenceRefs: ['evidence:stable-sanitized-id'],
    cleanup: 'complete', // only after owned activity is confirmed cleaned up
  };
}
```

Each attempt gets a fresh owned fixture directory and worker thread. The module
is operator code, never executable candidate content. It must remain
self-contained, use only admitted product connections and pass only sanitized
fixture/context data to a model. It must measure usage from the provider/harness
and inspect actual results; a model's `success: true` is not an observation of a
completed product action. Top-level self-reported success fields are rejected.
The engine derives check results rather than trusting pass/fail flags.

Budget fields are `maxAttempts`, `maxElapsedMs`, `attemptTimeoutMs`, `maxTokens`.
Metrics are `passedChecks` (higher), or `elapsedMs`, `tokens`, `interventions`
(lower), with a positive absolute `minimumImprovement`. Elapsed continuation
uses a monotonic clock. Known provider usage is charged even if parsing, cleanup
or evidence checks fail; unknown spend stays explicitly incomplete and stops
continuation. Token limits are continuation thresholds: a single response can
exceed the remaining amount. Timed-out workers are cancelled then terminated;
that does not prove an external provider or side effect stopped. Such evidence
cannot pass and requires operator cleanup inspection.

The private ledger retains input/context/output digests, assertions, reset IDs,
failure classes and sanitized evidence references. It does not automatically
capture raw transcripts. Author feedback omits held-out case details. Passing
requires every planned repeated result, all candidate critical checks, no
regression of a previously passing correctness/policy check and improvement in
the frozen metric within budget. Missing results or a favorable average cannot
waive a critical failure.

## Review and export

The evaluator/operator revalidates every authenticated attempt against its frozen
intent, planned order, unique reset, delivered knowledge and summary. An
independent reviewer then records a decision over that exact candidate and
evaluation. A different reviewer ID is required, but is not proof of independent
identity or access: the operator remains responsible for real separation.

```text
node tools/knowledge-practice/cli.mjs review --run <run directory> --candidate <candidate.json> --reviewer <independent ID> --decision accept --attestations <review.json>
node tools/knowledge-practice/cli.mjs export --run <run directory> --out <new artifact directory> --consumer catlas
```

`--decision reject` records a terminal rejection. Review input has this shape;
each check must be individually established rather than copied as a claim:

```json
{
  "checks": {
    "evidence": true,
    "privacy": true,
    "applicability": true,
    "independence": true,
    "heldOutIsolation": true
  },
  "notes": "Sanitized findings explaining this decision.",
  "evidenceRefs": ["review:independent-evidence-id"]
}
```

The default audience is `product`. Public fixture evidence cannot receive a
product acceptance or export, regardless of the flags in the review. To exercise
the workflow on a fixture, both commands must explicitly use `--audience fixture`;
the resulting receipt has `publicationEligible: false`. Fixture attestations
describe only the synthetic isolation/validation under test and never establish
a real protected holdout. The fixture author candidate is under `author/` and its
run is under `private-run/` inside the demo directory.

A proposal represents a **complete replacement bundle for one consumer**. Preserve
baseline entry IDs and increase an entry's revision when changing content or
scope. Implicit deletion and revision regression are rejected. Use separate
candidate/admission/review sets for Catlas and Orchestrator; their actual consumer
capabilities differ. Export validates both supported locales and the target
Platform version (defaults to this checkout, overridable by `--platform-version`).
No tool capability is gained from a knowledge entry.

Adding evaluation/review provenance must not change selected or delivered entries
in any frozen scenario. Both direct Catlas selection and assembled Orchestrator
context are checked, including the serialized size budget. If provenance crowds
out content, shorten the candidate and admit a new evaluation; an earlier passing
result cannot justify the altered delivery.

Export writes only `knowledge.json` and `export-receipt.json`, containing compatible
reviewed knowledge plus sanitized candidate/evaluation/review digests. It creates
a new directory and never replaces an installed or existing artifact. A failed
write leaves partial output for inspection; **only a successful command with a
complete matching receipt represents an export**. Do not consume partial output.
Accepted product exports are proposed changes to the owning config bundle through
the normal PR/release process. Do not ship candidates, evaluator keys, private
ledgers or raw practice state. Nothing is published or installed by this command.

## Inspect and revoke

```text
node tools/knowledge-practice/cli.mjs inspect --run <run directory>
node tools/knowledge-practice/cli.mjs revoke --run <run directory> --actor <operator ID> --reason <sanitized reason>
```

Inspection separates historical results from the current review, engine match
and revocation state. It is not a new evaluation or a complete export-eligibility
check. Any tool/evaluator change requires a new admission; old attempts cannot be
replayed, but can still be inspected and revoked after an engine upgrade.

The developer `ReviewedKnowledgeStore` is a local selection adapter. It checks
approval/evidence on every read, retains no cache, and checks revocation before
and after loading. This adapter is not an installed release override. Revocation
is idempotent, preserves prior evidence and denies future local reads/exports.

Export checks revocation immediately before starting its receipt write. This is
the export's **snapshot boundary**: a revocation observed there denies export and
leaves unapproved partial output. A concurrent revocation after that check applies
to subsequent operations; the already admitted export may finish flushing its
receipt. Consumers must not treat an old export receipt as proof of current local
approval. Previously exported or published copies are historical artifacts and
change through a new reviewed release, not by editing private run state.
