# Preview knowledge practice

This is an on-demand developer workflow for proposing and independently checking
product knowledge. It does not train model weights, start a scheduler, change an
installed Desktop, or add a release endpoint. The tools directory is outside the
npm/Desktop asset lists. Ordinary release Catlas and Orchestrator continue using
the production knowledge loader and their configured provider/model.

Implementation/checkpoints: [PLAN-109](plans/PLAN-109-cats-self-development-and-catlas-practice.md).
Requirements: [SPEC-117](specs/SPEC-117-cats-self-development-and-catlas-practice.md).

## Managed authoring in an isolated preview Desktop

The developer-only `tools/knowledge-practice/authoring-host.mjs` is an explicit
Platform sidecar entry for a candidate Desktop. It composes the normal app
startup/shutdown with one admitted knowledge-authoring task. It uses the same
FileChatStore instance and atomic mutation queue as that product server. It is
outside npm/Desktop asset inventories; ordinary installed builds expose no new
authoring endpoint or automatic practice loop.

Build Platform server/host and the selected preview Runtime. Use the existing
isolated Desktop candidate launch contract, including separate data/Electron
roots, non-default loopback listeners and owned app/Runtime sidecars. Set:

```text
CATS_DESKTOP_APP_ROOT=<built Platform checkout>
CATS_DESKTOP_APP_ENTRY=<Platform checkout>/tools/knowledge-practice/authoring-host.mjs
CATS_DESKTOP_RUNTIME_ROOT=<built preview Runtime checkout>
CATS_KNOWLEDGE_AUTHORING_REQUEST=<candidate root>/request.json
```

The host checks the candidate state paths, expected listeners, explicit Runtime
artifact and request location before normal startup can provision state. Desktop
process ownership/readiness must establish that these are its sidecars; a local
manifest alone does not identify an arbitrary running HTTP service. Admission
waits for normal startup recovery. Never use this entry against real user state.
After inspecting the actual Desktop PID, both child PIDs, lifecycle-ready events,
listener ownership, private roots and compiled Runtime revision, the native
operator writes `<candidate root>/authoring-start.json` with `requestDigest`
(the request's canonical SHA-256), `desktopPid`, `appPid` and `runtimePid`.
The host checks the request and its actual process/parent identity, waits at most
three minutes for this receipt, and makes no model call when it is absent or
invalid. This gate is a trusted local acceptance step, not an approval API.
Provider use still requires the owner's applicable authorization.

Private state directories alone do not isolate native provider instructions.
When a candidate lives beneath a source checkout, Codex can automatically load
ancestor repository guidance into the authoring context. Prepare a separate
project boundary (for example, a private Git root with minimal author guidance),
and inspect the actual native instruction history as part of acceptance. A local
Git-root check establishes preparation only; it does not prove which context the
provider loaded or guarantee a token budget. See
[Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

Request schema 1 contains `id`, `title`, an explicit `target` with `provider`,
`instance`, `model`, a `budget` with `maxDurationMs` (1,000–300,000) and `maxTokens`
(1–80,000), a complete `draft` in the existing candidate-draft shape, and `evidence`.
Each evidence entry has `id`, a sanitized `summary`, and a SHA-256 `sourceDigest`;
the ordered IDs must equal the draft's `evidenceRefs`. The draft supplies the
admitted author, applicability, baseline entries and initial counterexamples.
The model returns a revised draft; it cannot select new evidence references or
claim independent verification. These operator-supplied summaries/digests need
independent checking before later evaluation/promotion.

The optional request `changeScope` is an operator-owned array of
`{ "entryId": "code.recovery", "evidenceRefs": ["evidence:verified-stop"] }`.
Each unique entry must already exist in the supplied draft and each unique
supporting reference must be admitted in its evidence. Omission means no entry
changes are permitted. The model cannot supply or broaden this scope. It may
edit only scoped content, with a higher entry revision and a distinct bundle
revision. Both languages, revisions and content of unrelated entries remain
exactly unchanged. Entry order, IDs, roles, kind, surfaces, topics, operations
and bundle applicability stay fixed. New entries or applicability changes need
a separately designed admission; this bounded path does not accept them.
Scope permits a proposed edit; independent evaluation still has to establish
that its evidence is relevant and its guidance correct.

The first slice distills existing development evidence. It creates one Core
worker, Task and Run, then a fresh read-only Runtime sandbox with only the
`cats-practice-and-distill` skill and read/list tools. The host checks Runtime's
actual preview policy, canonical artifact/skill paths, resolved/applied versions
and fingerprints, provider/instance/model, session-bound hydration provenance,
tool allowlist and workspace before
dispatch and again after response. It records delivery mode and distinguishes
materialized resources from unestablished optional instruction resources. Session
lifecycle supervision permits creation/cancellation; the worker's tool and
filesystem grant remains read-only. Its permission gate is explicitly `default`,
as required by the product's read-only session policy; the read/list tool allowlist
is supplied separately and retained in the observed receipt.

The host validates the returned JSON, writes `draft.json` and `candidate.json`
under `<candidate root>/knowledge-authoring/<id>/`, and declares an attributed
Code artifact with candidate disposition and draft status, linked to its Task,
Run and Runtime session. `authoring-receipt.json` is a local inspection snapshot;
the Core run is authoritative for later usage/cleanup callbacks. Candidate
knowledge remains **unverified**. A completed run means drafting completed, not
that the lesson improves product behavior or can ship.

Admission and session-create/send intent are persisted before execution. Reusing
the same request ID inspects the existing attempt; changed inputs with that ID
are rejected. Startup fences an interrupted run and its Task without dispatching
again; cleanup of a known session is retried only against the same recorded
Runtime endpoint/artifact binding. Unknown session creation stays explicit.
The stored package digest covers `package.json`; compiled entry/revision and
process ownership must be retained separately in the native evidence. A cleanup
value of `requested` means HTTP acknowledgements only, while `pending` means the
request failed or timed out. Verify owned process disappearance separately.
Retain partial output and reconcile ambiguous effects before explicitly admitting
a new ID. Canonical Run stop and owning-Task cancellation fence materialization;
known usage from late responses remains recorded. Unknown usage, malformed
output, changed delivery or an exceeded token threshold cannot yield a candidate.
Unexpected tool activity also rejects the draft and remains visible in the run.
The token budget is checked after the one response and is not a hard spend cap.

This slice does not execute a source fix, run the frozen practice curriculum,
review/export knowledge, or update a release bundle. The normal independent
evaluation and promotion workflow below still applies. See PLAN-109 for actual
fixture/native acceptance status and retained checkpoints.

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

To exercise topic retention using the actual shipped Catlas baseline:

```text
node tools/knowledge-practice/cli.mjs fixture-demo --suite preservation --runtime-root <preview Runtime checkout> --out <new private directory> --consumer catlas
```

This public fixture appends one synthetic cancellation lesson only to recovery,
checks ten bilingual cases with three resets per baseline/candidate pair, and
checks retained guidance in actual production-assembled contexts. Its evaluator
checks literal retention and lesson placement; it does not measure a model's
understanding or real task success. Its four public holdout-shaped cases are
not protected holdouts. Orchestrator applicability is not established by it.

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

Product exercises must independently freeze `changeScope` with the same shape
as authoring; scoped fixtures may opt in. The operator chooses this scope against
the frozen baseline rather than trusting a candidate's own declarations.
Admission requires scenarios that actually deliver every baseline entry in
both languages. Evaluation retains its start/candidate records but refuses to
dispatch the evaluator if the proposed content violates that scope or refers
to evidence absent from the candidate. Verification checks it again. Legacy
unscoped selection fixtures remain fixture-only; old receipts are historical
and cannot be replayed under a changed engine digest.

For scoped exercises, the engine appends the reserved critical check
`baseline-guidance-preserved` to every attempt. It compares actual baseline and
candidate direct Catlas selections and assembled role contexts, retaining all
baseline entries and exact unscoped guidance and applicability, including cases
where a longer edit exhausts either budget. The verifier recomputes it
independently of evaluator output. Frozen
scenario checks cannot use this reserved ID. Edited content still needs its
own independent correctness checks: an allowed recovery edit can lose useful
recovery guidance even while all unrelated entries remain intact.

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
