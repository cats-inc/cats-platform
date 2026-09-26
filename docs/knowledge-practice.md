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

## Catlas semantic evaluator preparation

`tools/knowledge-practice/catlasEvaluator.mjs` exports `createCatlasEvaluator`
for a trusted developer harness. It calls the actual `inferCatlasAdvice` seam
with the production knowledge selector and checks the assembled context against
the admitted inputs. This is not a native launcher, a new product endpoint or
inference authorization. It has no default Runtime connection, credentials,
model judge or process observer.

The caller supplies the owned `runtimeClient`, explicit `guideCat` binding,
`evaluationRoot`, separate `authorId`/`reviewerId`, and four trusted callbacks:

| Callback | Required result |
| --- | --- |
| `loadKnowledge(digest, locale)` | The exact frozen, compatible production-loader result for the attempt |
| `resolveRubric(rubricId)` | Independent criteria as `{ id, criterion }[]`, fixed before authoring |
| `judge({ response, responseDigest, criteria, signal })` | Independent semantic decisions bound to the exact response, with measured usage |
| `confirmCleanup(observation)` | Independent owned-process evidence as `{ status, evidenceRefs }` for each `stage`: `catlas` and `reviewer` |

Role IDs do not establish reviewer independence. The native operator must enforce
the author/evaluator read and write boundaries and inspect actual provider context.
The judge sees the sanitized question, observation, locale, advice and cited
knowledge IDs, with a reset ID. It does not receive baseline/candidate labels,
bundle revisions, the Catlas execution binding or the candidate author's draft.
The observed coding target may identify its own provider. Criteria go only to
the judge; the author receives neither the criteria nor the held-out curriculum.
During evaluation, Catlas receives each admitted question and observation,
including held-out cases, without rubric IDs, grading criteria or expected
outcomes. Meaning is judged independently, without keyword scoring.

Fixtures contain exactly `question`, `observation` and evaluator-only `rubricId`.
The observation represents the existing **new Code** draft/readiness fields;
requested policies pass the actual Runtime policy validator. Effective session
access is `not_started`, Git status is `unknown`, and all four ordinary Code-help
topic groups are selected. Reports about an earlier task belong in the question;
they cannot be invented as observed process telemetry. This seam does not test
native UI, actual observation collection or the full Code-help service.

Judgment has `reviewerId`, `responseDigest`, `usageTokens` and one decision per
criterion: `{ id, verdict, rationale, evidenceSpans }`. Verdict is `pass` or
`fail`; indeterminate, missing, stale or duplicate decisions make assessment
incomplete. Spans are bounded UTF-16 offsets `{ start, end }` into the exact advice;
a passing decision needs evidence. A whole-response span is appropriate for a
universal absence-of-violation criterion when independently assessed as such.
Usage is a measured nonnegative integer; zero is appropriate only for a review
that used no inference. Any model judge needs applicable authorization and its
own measured accounting; unknown spend is never zero.

The attempt returns `complete`, `observed.responseValid` and
`observed.semantic[id]`. An incomplete assessment stops evaluation in either
phase; an invalid baseline cannot be scored as a low baseline that makes the
candidate appear improved.
Every admitted semantic scenario must require `responseValid === true` as a
critical check, alongside its policy/correctness criteria. A complete negative
decision is distinct from incomplete assessment. `usageTokens` includes Catlas
and judge transport usage, including rejected results. `knownTokens` retains
the measured subtotal when another effect's usage is unknown. Unknown usage prevents
continuation. Cleanup requires independent confirmation for both stages; a
session-close acknowledgement or completed judge response is insufficient.

Exclusive intent precedes create/send/judge work. Private assessment files retain
bounded sanitized advice, criteria, decisions and digests for this explicit QA
workflow; this is not ordinary conversation capture. Cancellation fences late
output. While the worker survives, late creation is closed without dispatch and
late transport/grade usage is retained without changing an incomplete result.
The create intent retains the actual product request ID for reconciliation.

**Native readiness remains pending.** A forcibly terminated worker cannot finish
these promises. The parent bridge below retains effects beyond that worker, but
its native callbacks still must prove Runtime ownership, independently check
process disappearance and reconcile interruption. Freeze the entire
static executable/callback/rubric closure using the preparation command below;
hashing a wrapper that imports a mutable checkout is insufficient. Mutable data
must still be embedded or independently digest-checked. The existing engine hash
covers tool sources and the knowledge loader, not every transitive Catlas/Runtime
import. Public callback tests establish plumbing only, not protected holdout isolation, live
quality improvement or promotion eligibility.

## Runtime-backed independent judge

`createRuntimeKnowledgeJudge` in `runtimeJudge.mjs` supplies a parent-only judge
for the supervisor below. Bind an explicitly owned Runtime client, target,
evaluation root, distinct reviewer/author IDs, and an independent
`observeCleanup(snapshot)` callback. There is no endpoint discovery, credential
loading or automatic retry. Wire its `judge` into the supervisor and route reviewer
cleanup to its `confirmCleanup`; Catlas cleanup still needs its own observation.

Each reset creates one fresh sandbox/read-only session and explicitly requests
`{ requestedSkills: [], strict: true }`. Runtime omits skill state for an empty
manifest. Both the Catlas evaluator and reviewer therefore require authoritative
hydration/inspection snapshots and verify that skills are absent from the session,
hydration and inspection before and after sending. A present skill state, even
an empty object or null, and a truncated observation are rejected. This is absence
of Runtime-delivered skills; the dropped strict flag is not a delivery receipt or
proof of native read isolation. The empty request must not be used to clear a
reused session. Observed target, model and workspace policy must also match.
The reviewer receives only the sanitized response and rubric;
the model returns decisions and exact quotes. Trusted code converts unique quotes
into UTF-16 evidence spans and validates complete rubric coverage. A valid negative
decision is complete even without a quote; indeterminate or malformed decisions
are incomplete. Model-written usage is rejected; positive transport usage is saved
before parsing, including usage from rejected or interrupted responses.

Exclusive `resets/<resetId>/judge` journals retain intents, session identity,
measured usage, cleanup and result evidence. The parent retains pending create/send
promises and closes late sessions without another send. Cancellation, missing
process proof or a failed final receipt clears decisions without erasing measured
spend. An abort during the final receipt flush also clears the returned decisions;
the parent abort/seal fence remains authoritative over a previously written result.
The generic retained-effects inspector reads the supervisor ledger, not this judge
subdirectory. Neither journal permits replay.

**This adapter does not establish native blinding or process isolation.** A prompt
omitting author labels is insufficient if native tools can read the evaluator tree.
Legacy read-only policy restricts writes, not all reads; dynamic tools do not disable
other native tool paths. Native use still requires a proven restricted read policy,
owned endpoint/process evidence and an independently reviewed cleanup observer.
The tests use transport/observer doubles, including the real HTTP client over mock
fetch; they make no provider call or product-quality claim.

## Dedicated container exit observation

`createDockerExitObserver` in `dockerObserver.mjs` records process disappearance
for one dedicated container. Bind an exact local daemon ID, full container/image
IDs, owner token, network ID (or `none`) and expected read-only bind mounts.
`arm({ resetId, stage, sessionId })` must observe it running before dispatch.
An exclusive claim indexed by container ID prevents reuse under another reset or
observer instance within that evaluation root. The per-role journal retains only
sanitized identity/state and configuration digests, without environment, command
arguments, health logs or daemon diagnostics.

`confirmExit` accepts the exact armed reset/stage/session tuple and requires two
fresh, identical exited/PID-zero observations. Creation/start times, ownership,
image, containment settings and restart count must match the armed identity.
Read-only root/mounts, private PID/IPC/cgroup namespaces, nonroot UID, dropped
capabilities, no-new-privileges, restart policy `no` and disabled auto-remove are
checked. Identity/policy drift or failed receipts permanently invalidate the
observer. Missing containers, transient read failures, concurrent confirmation and
exhausted observation quota return incomplete. Nonzero exit and OOM remain visible
even when process disappearance is confirmed. Removal does not turn a historical
receipt into current observation.

The explicit result scope is **`container-exit`**, not Runtime cleanup. A separately
reviewed binding must prove the Runtime endpoint/session and every producer belong
to that container before a parent callback may translate this result into cleanup
evidence. Rejected/unknown Runtime creation stays unresolved. The daemon ID is a
logical identity, and Docker's PID belongs to its Linux host/VM, not a Windows PID.
Do not use it in Windows process operations. The observer neither starts nor stops
containers and proves neither read blinding, network policy, usage nor quality.

`createDockerReadClient` uses an explicit executable, private CLI config, working
directory and local named-pipe/Unix-socket endpoint. Only projected inspect fields
and daemon identity are requested; inherited Docker overrides are omitted. Each
read-only CLI process has a five-second/128-KiB observation limit. Termination first
signals that child, then escalates to SIGKILL after 250 ms. After one second of
termination grace, an unconfirmed child latches the client unavailable, closes its
owned pipes and leaves the pending PID visible through `inspectTransport`; late
exit updates diagnostics but never replays a read. Container cleanup cannot be
inferred from this failure. CLI/external image identities and dynamic binding
data still need independent freezing/review for a native pilot.

A native synthetic canary used a cached image with no credentials, Runtime or
model, confirmed allowed-file access, outside-file absence and denied writes, then
observed exit of its shell/background child and removed only the owned container.
This validates the container observer/transport mechanism, not a credentialed
Runtime or native model evaluation. A subsequent private image preflight pinned
the official Node base, verified the native archive and exact copied Runtime/CLI
payloads, checked launch configuration before start, then passed native
version/schema and idle Runtime health/shutdown inside a network-disabled
container. The external observer confirmed exit before exact-owned removal.
Neither that idle test nor its fresh private home establishes provider-thread
readiness or session cleanup. A further create/observe/close-only canary verified
the actual empty-skill assertion against Runtime, recorded a logical session and
its direct native app-server child, observed child disappearance after close,
and confirmed container exit before removal. No message was sent: the native
thread remained uninitialized. This is contained process/session evidence.

A subsequent private parent transport canary froze the real Platform HTTP client
and used authenticated, lease-bound stdio to the exact dedicated container. Its
verified bridge admitted one exact create request, own-session observation/close,
and shutdown; a send request was rejected before Runtime. Runtime's API key stayed
in process memory and the client used its private loopback endpoint without a
published host port. The session/request/native process identities were recorded,
then close, child disappearance, drained transport and independently observed
container exit/removal passed. Request journals describe invocation uncertainty;
successful replies become visible only after receipts of authenticated replies are
flushed. Nine private offline process checks cover loss, forgery, duplicates,
late replies and journal failures. This proves **parent create-only transport**.
It does not establish a reusable production bridge, send/usage/cancellation,
native tool readiness, author read isolation or model quality.

A separate credential-free Linux command canary moved the private home to an
empty, nonroot-owned `/home/cats` tmpfs and verified complete, untruncated native
output drainage. The earlier temporary-home helper warning disappeared. Both the
named restricted-read probe and its ordinary read-only control failed before
executing their synthetic command because bubblewrap could not create a
namespace. Neither read isolation nor native tool usability passed. The native
process exited, independent container exit was observed, and the owned container
was removed. The original outer failure also retains a conservative parser miss:
the unknown-profile error said `undefined profile`, which its matcher omitted.
Offline inspection confirms that negative control only; it cannot establish a
successful command or change the original receipt.

This namespace error is consistent with Docker's default restrictions but does
not identify the sole enforcement layer. The installed Engine build and its
seccomp dependency were pinned for investigation; no custom profile, capability,
daemon or host policy was changed. Codex's [versioned Linux sandbox notes](https://github.com/openai/codex/blob/rust-v0.157.0/codex-rs/linux-sandbox/README.md)
require bubblewrap for restricted filesystem execution. Any future dedicated
container policy needs its own review, exact byte binding and native validation;
ordinary syscall filters do not express that an operation is allowed only after
entering a child namespace. See [Docker's seccomp contract](https://docs.docker.com/engine/security/seccomp/)
and [the kernel filtering model](https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html).

## Parent-owned Catlas effects

The programmatic `evaluatePractice` accepts an optional `effectSupervisor` from
`createCatlasEffectSupervisor` in `catlasEffects.mjs`. Supply the exact evaluation
root and target, an owned Runtime client, an independent `judge`,
`confirmCleanup` and `reconcile` callbacks. There are no endpoint, credential or
provider defaults. This API is not enabled by an ordinary `evaluate` CLI call.
The worker receives `effectPort`; `createCatlasEffectClient({ port, resetId })`
provides Runtime/judge/cleanup proxies for `createCatlasEvaluator`.

The parent permits one create, one advice send and one judge per reset. It checks
the explicit target, read-only sandbox grant, admitted question/observation and
owned session ID; the port is not a general Runtime proxy. Slots are reserved
before intent I/O, and flushed intent precedes callback invocation. New effects
are sealed at the worker result, interruption or timeout, before the termination
grace. A token threshold exhausted by advice prevents a subsequent judge call.
Additional model selections, output paths, skills, strategies or routing fields
are rejected before invoking Runtime. Advice usage must be positive: Runtime's
default zero does not prove a measured zero-token provider response. Optional
undefined SDK object fields are omitted during transfer; invalid JSON values
still fail after their independently measured usage has been recorded in memory.

Worker termination cannot discard parent-owned callback promises. The parent
records late session IDs and measured usage under the reset's `effects` directory
and invokes `reconcile(snapshot)` after disconnection and late changes. An
observer's earlier cleanup result cannot certify a newer generation. Reconcile
must operate only on the owned Runtime/profile and recorded session/request IDs,
never launch inference, and use its own bounded cleanup deadline rather than the
aborted inference signal. A rejected create without an ID remains unresolved,
even if a point-in-time observer reports no session. Unknown effects are not
permission to retry or guess ownership.

`seal` is idempotent. `drain(timeoutMs)` waits at most the specified bound and
returns current pending/cleanup state; it does not cancel remaining promises or
prove native process exit. The host must keep the supervisor alive while dealing
with that state. The engine uses parent measurements instead of worker reports,
retains the known subtotal separately from complete usage, and refuses to proceed
with pending or unconfirmed effects. This failure is fixed at the worker's result
boundary even if a late effect settles during termination. Later evidence can
resolve accounting and cleanup for inspection; it never rewrites an interrupted
attempt as successful. Intent/result persistence failures prevent durable cleanup
certification, even when measured spend remains available.

This boundary has public tests with actual terminated worker threads and local
callback doubles. Before native use, independently freeze/review the **parent**
handler implementation, binding, rubric and observer too; the worker bundle does
not freeze its parent's callbacks. Native endpoint/process identity, effective
author read isolation and recovery after the **parent process** itself exits
remain separate gates. Durable intent/result records preserve uncertainty and
fence replay; they do not implement a restart that resumes model work.

### Inspect retained effects after interruption

Inspect one reset without loading its evaluator or calling Runtime:

```sh
node tools/knowledge-practice/cli.mjs inspect-effects --run PRIVATE_RUN_ROOT --reset RESET_UUID
```

The programmatic equivalent is `inspectCatlasEffects({ evaluationRoot, resetId })`.
It reads only that reset's bounded parent journal, checks canonical records,
intent/terminal pairing, call quotas, target/digest agreement and historical
generation consistency, then checks that the recognized files stayed unchanged
during the read. Directory aliases, hard links, torn writes and unexpected files
cannot become consistent evidence. Diagnostics use fixed codes, without printing
malformed contents or arbitrary file names. Inspection never writes a receipt,
changes an evaluation, imports the evaluator or resumes any callback.

`recordedKnownTokens` is the subtotal from unambiguous valid terminal records.
`usageUncertain` remains true for incomplete, malformed or conflicting evidence;
it also remains true without a valid seal, since admission has not been recorded
as closed. An unstable read returns a null subtotal. An intent alone cannot establish that
its callback was never invoked: `invoked: false` was written **before** invocation.
The reader therefore reports unknown invocation/settlement until a matching
terminal exists. A failed terminal can still retain measured usage and a created
session ID. When result/failure records conflict, both validated claims remain
visible but neither is counted; no winning record is guessed.

These records are unauthenticated. Their consistent placement and digest do not
prove their origin or bind them independently to an admitted reset. A stable
snapshot also does not prove that the parent has exited, that no new effect can
arrive, or that an external provider has stopped. Accordingly the report always
keeps `currentCleanup: 'unobserved'` and `replayAllowed: false`; reconciliation
records are historical observations only. Use retained session/request identities
with a separately authorized, independent process observer before claiming native
cleanup. Inspection supplies evidence for recovery; it does not grant a replay or
recover a live evaluation after parent-process failure.

## Freeze a trusted evaluator

A reviewed entry can export both process roles from the same static closure:

```js
export { attempt } from './trusted-worker.mjs';
export { createSupervisor } from './trusted-parent.mjs';
```

When the parent factory statically imports its Runtime/judge/cleanup implementations,
target binding and rubric, those JS/JSON inputs are bundled and recorded alongside
the worker helper. The parent can import `createSupervisor` from the verified frozen
module, then pass its result to `evaluatePractice` as `effectSupervisor`. Compare the
frozen code digest against both the independently reviewed digest and the admitted
worker digest before importing it. The parent factory name is a composition
convention, not a second export validated by the freeze command.

An integration fixture exercises this composition through real admission, a worker
thread, parent-owned callback dispatch, evaluation verification and retained-effect
inspection after deleting the composition entry and JSON source inputs. Parent and
worker use identical frozen bytes and the single baseline attempt records 49
fixture tokens, including 7 measured by the actual Runtime judge adapter in a
separate reviewer session/journal. It stops at the attempt limit without running
candidate advice or a full comparison and stays ineligible for production. The
Runtime transport and cleanup observer are public doubles; this proves the
composition mechanism, not native
ownership, a live judge's quality, author read isolation or provider cleanup.
Injected callbacks and data read dynamically from files, environment, network or
processes still require separate freezing/binding and review.

Build the required product consumers first, then prepare a reviewed `.mjs` entry
that exports `attempt`. From Platform:

```text
node tools/knowledge-practice/cli.mjs freeze-evaluator --entry <trusted entry.mjs> --out <new private artifact directory> --author-root <author workspace>
```

This command uses the installed esbuild compiler to bundle static JavaScript and
JSON imports, including literal dynamic imports. It does not import or execute
the entry, contact Runtime, invoke a judge or authorize inference. The entry and
every physically resolved dependency must be outside the declared author scope;
directory aliases do not bypass that check. Missing imports, nonliteral dynamic
imports, direct `require`/`eval`/`Function` code loading, remaining `node:module`
loading, compiler warnings and artifacts over 256 KiB are rejected. Admission and
verification use that same size limit. The worker still checks that the exported
`attempt` is a function when executing it.

The explicit recipe targets Node 22 ESM with no source map. The manifest records
Node/esbuild/parser versions, source hashes, digests and lengths of compiler input
bytes, the recipe, builtin imports and final artifact digest. The known App
SDK version initializer is pinned to the checked Platform package version; both
digests and lengths of its original/transformed bytes and the package digest are
recorded. Any change to that initializer/import requires reviewing the narrow transform.
Source bytes are rechecked before publishing the pair, so a concurrent edit
cannot silently change the recorded closure.

The new output directory contains `evaluator.mjs` and a flushed `manifest.json`
completion marker. Failed or partial writes remain for inspection; never reuse
or overwrite the directory. The exported `verifyFrozenEvaluator(root)` checks
the code against the supplied completed manifest without executing code or
consulting original source files, and returns the manifest digest. It does not
authenticate provenance: an operator who rewrites both files can change the pair.
Independently review that manifest and artifact before passing its evaluator
file to `admit`. Admission binds the exact executable bytes; it is not automatic
approval of the freeze manifest or of any callback's behavior. Existing trusted
self-contained fixture modules may still be admitted directly.

This freezes **static code and imported JSON**, not arbitrary runtime behavior.
It is not a JavaScript sandbox or a defense against a malicious trusted operator.
Node builtins, `import.meta.url` resources, callback filesystem access and external
processes can still reach mutable data. Embed the rubric/immutable inputs or
verify their independently frozen digests, and retain the actual Runtime/judge
ownership and cleanup evidence. Do not resolve release knowledge paths from a
relocated evaluator's default resource directory: supply the admitted knowledge
file explicitly, preserving its exact bytes and consumer capabilities. A passing
public frozen-module test proves relocation and plumbing, not native readiness.

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
    complete: false, // true only when the assessment itself completed
    observed: { /* bounded facts checked by the frozen engine */ },
    usageTokens: null, // measured nonnegative integer, or unknown
    knownTokens: 0, // measured subtotal, even when total usage is unknown
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
`complete` and `knownTokens` are additive for older generic fixture modules;
Catlas always supplies them. If provided, false completion stops either phase,
and known usage must equal the total whenever that total is complete.

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
