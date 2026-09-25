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
node tools/knowledge-practice/cli.mjs fixture-demo --runtime-root <preview Runtime checkout> --out <new private directory>
node tools/knowledge-practice/cli.mjs inspect --run <private directory>/private-run
```

The demo performs no provider calls. It tests actual product-knowledge assembly
with ten named synthetic cases and three fresh resets for each baseline/candidate
pair (60 attempts). Four public sample cases exercise the held-out plumbing;
because the sample is public, it is **not a protected production holdout**.
Successful fixture evidence is explicitly ineligible for production promotion.
No observed improvement here establishes live model or UI competence.

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

Independent digest-bound review, active selection, export and revocation are the
next P4 slice. A P3 passing evaluation alone never activates or publishes a lesson.
Do not manually move candidate/private receipt files into shipped config assets.
