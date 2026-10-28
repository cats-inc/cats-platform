# SPEC-128: Shared image service and controlled Cat generation

## Metadata

| Field | Value |
| --- | --- |
| Status | Approved for implementation — 2026-10-23; implementation in progress, acceptance pending |
| Owner | Platform integration; Apps owns Studio consumer acceptance; Runtime owns execution |
| Reviewer | Owner and subsequent independent implementation review |
| Decision | [ADR-136](../decisions/136-share-controlled-image-capabilities-between-cats-and-studio.md) |
| Plan | [PLAN-121](../plans/PLAN-121-shared-image-service-and-controlled-cat-generation.md) |

## Summary

Let Studio and Cats use the same Platform image service. Studio goes through the App SDK;
a Cat goes through an agent tool constrained by session/actor scope. A Cat's capability does
not depend on whether Studio is installed, and does not require a Boss Cat. Proactive image
generation runs under a limited policy the owner grants in advance; once saved, the image is
attached to the original DM and sent to the authorized Telegram binding.

This document defines the implementation contract; the scope already completed and the
actual verification are recorded in PLAN-121, and unfinished acceptance must not be treated
as delivered.

## Delivery baseline and scope

2026-10-23 implementation rebaseline: the owner approved implementation and the necessary
releases, and clarified that the shared object is Studio and that Usage is unchanged. At the
start, the SDK was already 1.7.0; Runtime SPEC-038 and Studio already provided image
contract 2, all of Runtime's Grok / Muse / Codex / Antigravity profiles were enabled, and the
output includes JPEG / PNG. Keep both the old and new App contracts and the capabilities
already delivered; do not fall back to Grok-only.

2026-10-24 source extension adds Cursor to Runtime image projection and SDK contract 2 provider
types. The shared Cat ledger uses the same provider set so a valid new profile cannot be offered
then rejected during reservation or receipt reload. Existing grants, App/account scoping and
schema 1 projection remain unchanged. Cursor's pinned generation profile is GLM 5.3 / max,
native 1:1 requested; its image backend is not identified by the agent model.
The isolated Studio package/host check now accepts `--expect-cursor` to verify five services in
Codex / Antigravity / Grok / Muse / Cursor order, centered/default Grok, Cursor JPEG retention
and reopening without generation. This is fixture coverage, not paid runner acceptance or an
installed Desktop update. Runtime owns that runner and its enablement evidence: one separately
authorized extra image passed the corrected native Windows runner, retaining an original
1024-square JPEG (90,500 bytes). The Cursor profile is enabled. This host exposes it through
SDK 1.9 without changing existing App scopes or the image request schema.
Actual publication must still pass the corresponding release SOP and all completion
conditions.

| Item | Already exists | This plan |
| --- | --- | --- |
| Studio / SDK | App/account/version/digest-scoped contract 1 / 2 image generation, work read/export | Shared execution layer; SDK 1.8 adds `media.images`, keeping existing namespaces / scopes |
| Cat companion | Rhythm, text heartbeat, album images attached to Telegram | Add controlled image generation and image asset attachments |
| Runtime | SPEC-038 contract 2 with four enabled profiles, JPEG / PNG, no automatic regeneration | Add completion evidence for the original source turn and the necessary idle handoff; keep the execution boundary |
| Image editing / compositing | Apps SPEC-006 successor plan and research evidence | Keep an extension seam; this phase uses only the generation already delivered |
| Delivery | Chat event fanout and Telegram receipts | Add a durable intent, receipt judgment and recovery for image results |

### Goals

- After the owner authorizes an ordinary companion Cat, it can generate images by itself
  during awake hours and send them to the same Telegram DM.
- Studio and Cats use the same admission, job state, result verification and original-file
  retention.
- Concurrency, restart, resend and Telegram failure do not cause unauthorized or duplicate
  image generation.
- It can distinguish "not authorized", "no usable image service", "generating" and
  "generated but not delivered".

### Non-goals

- This phase adds no image editing, compositing, new provider, or arbitrary CLI / image URL /
  file path; the existing PNG and profiles are kept.
- It builds no general App execution framework, does not let a Cat operate the Studio iframe,
  and does not move all App logic into Platform.
- It does not share the Studio and Cat work lists by default; cross-caller sharing needs
  separate explicit authorization.
- It adds no OS wake-up or cloud residency; instant generation or delivery is not promised
  while Cats / the host is not running.
- It does not change the companion heartbeat default interval, and does not turn every text
  heartbeat into image generation.
- Usage is not changed. Versions / release follow this owner authorization and the release
  SOP; verification uses an isolated profile, and no demo data is written to the user's dev
  state.

## Owner-visible golden path

1. The owner picks an active companion Cat and creates its DM and Telegram mapping.
2. The owner turns on proactive image generation for that Cat, picks an available image
   target, and sets a limited daily count, minimum interval, budget timezone, expiry, and the
   conversations and bindings it may deliver to; the image service has no business hours.
3. During awake hours, a heartbeat lets the Cat choose to stay quiet, speak, use an existing
   album, or request image generation.
4. Platform re-checks authorization and availability, atomically reserves the count and
   saves the job, then submits to Runtime once.
5. The Cat's turn may end first; it does not hold the session gate or channel mutation gate
   waiting for the image to finish.
6. After the image is verified and saved, it appears in the original DM as that Cat's image
   message, with the same durable delivery intent. The text caption may use the Cat copy
   saved at submission time and does not force another model turn.
7. Telegram receives the image and caption. The owner's reply continues the same conversation;
   failed and unknown delivery states can be inspected.

Morning wake-up, text heartbeats and the owner's sleep intent are still governed by SPEC-124.
Generation and delivery must each satisfy the policy applicable at that moment; after entering
rest, the owner putting the Cat to sleep, or the binding becoming invalid, a late result may
be saved but must not be sent out without a policy check.

## Architecture and ownership

```text
Studio -> existing App SDK -> App identity adapter ----+
                                                      |
Cat session / heartbeat -> scoped agent tool adapter --+-> Platform image service
                                                           | admission + budgets
                                                           | durable jobs + assets
                                                           v
                                                     Runtime image HTTP API
                                                           |
                                              verified result / same receipt
                                                           v
Platform asset -> conversation attachment + delivery intent -> Telegram
```

The shared service depends only on a trusted caller context, the image job / asset store, the
Runtime client and the policy interface. It does not import the Studio, Chat renderer or
Telegram implementation. The Chat adapter manages Cat messages, and the transport adapter
manages Telegram. The Platform host only does composition; product-local routes do not expose
the shared Runtime credentials.

Apps' own templates, edit history and work management logic still belong to Apps. The source
and sharing permissions of a shared image job are managed by Platform. Core task/run/artifact
can be reused, but not every heartbeat becomes a Work Mission / Work Item, and no second
source of truth for jobs is added.

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-01 Shared execution | The App and Cat adapters use the same job service, Runtime client and asset verification, without duplicating the runner or provider catalog |
| FR-02 App admission | Keep the existing App enablement state, exact version, package digest, account, `ui.route` / `media.images` and CSRF / bridge checks; other Apps of the same account cannot inherit permission |
| FR-03 Cat identity | The caller Cat/account/conversation/session is established by a host-issued context; the model cannot pass an App scope, owner ID, raw path or Runtime credentials to obtain capability |
| FR-04 Role separation | Boss/admin, the companion role and a Studio install each do not automatically grant image-generation rights; a grant can be given to an ordinary Cat, and a proactive trigger additionally requires an active companion and a valid DM |
| FR-05 Capability | Offer only the operations and targets Runtime has enabled, intersected with the caller policy; querying does not probe the CLI or generate images. Submission re-checks; it must not quietly swap provider, model, effort or operation |
| FR-06 Policy | Proactive generation is off by default; the owner grants a limited policy. manual / heartbeat are different trigger modes; authorizing one does not imply the other or delivery rights. The image service has no time-window restriction; rhythm only schedules proactive interaction and does not intervene in tool / admission / generation / delivery. Both triggers verify the expiry / quota / interval and the original scope |
| FR-07 Durable budget | Admission atomically performs request dedupe, policy revision check, daily / total count and interval reservation, job creation and the fixed Runtime ID; cross-caller concurrency cannot exceed the quota |
| FR-08 Idempotency | The same caller/request ID + the same canonical payload returns the original job; a different payload conflicts. The payload includes operation, target, prompt and the authorized output context |
| FR-09 Execution | The first phase delivers only Runtime's existing `{id, instance, prompt}`; the caller cannot pass shell args, an execution cwd, a file destination, or widen the native tool list |
| FR-10 Async tools | The Cat actually receives a callable session-scoped tool descriptor / executor; a prompt, tool registration or tool name alone does not count as delivery. submit returns a job reference and does not wait on a resource occupied by the same Cat's turn |
| FR-11 Recovery | An unknown POST, restart and refresh only GET / collect / cancel the same Runtime ID; they do not resend a new generation. When it is unconfirmed whether the provider was called, the reservation is not automatically refunded |
| FR-12 Cancellation | Cat/policy revocation, owner cancel and App disable each affect only their own jobs. Cancellation must wait for the original execution to stop; a late success does not override the revocation or cancel intent |
| FR-13 Verified asset | Obtain the original file from the matching receipt, verify MIME, size, dimensions and hash, and mark succeeded only after an atomic save; reference by asset ID, with no arbitrary filesystem read |
| FR-14 Access | read/list/cancel/reference verify owner, initiator scope or an explicit sharing grant; guessing a job/asset ID yields no data. Studio does not automatically obtain all of a Cat's works |
| FR-15 Attachment | The image is attached to the existing DM under the same Cat identity. The data includes the source job, asset, Cat/account, conversation, trigger and policy revision, to avoid being treated as a reply to another owner's turn |
| FR-16 Delivery admission | Image success does not mean sending is allowed; at creation and at send execution, re-check Cat/policy, conversation, owner and binding identity / revision; all accepted jobs can be delivered while the DM is being watched, with no separate window or sleep check. Archived / disabled / revoked is still rejected; it does not drift with the default bot |
| FR-17 Durable delivery | The message and delivery intent are created in a recoverable transaction or the same idempotent command; a lost eventHub or a process restart can still be handled. A duplicate completion does not add an image message or a logical intent |
| FR-18 Truthful receipt | Success is judged from the actual status of the Telegram receipt. A definite, retryable non-delivery failure uses backoff with the same asset; an unknown result stays uncertain and needs an explicit owner retry, and exactly-once cannot be claimed |
| FR-19 Lifecycle | Uninstalling Studio revokes the Studio scope, and does not revoke the Cat grant or delete Cat assets. Turning off a Cat does not affect Studio; an asset with a pending delivery is not removed early by retention |
| FR-20 Observability | The owner can inspect readiness, remaining policy count, the latest generation / delivery results and safe errors; unknown cost / results stay unknown. Settings write feedback follows the Toast rule |

## Policy and record semantics

The following is the internal shape; Cat identity / policy / binding is kept separate from the
SDK / Runtime payload. The public SDK does not accept a Cat identity, source session hint,
path or delivery destination.

### Implemented boundaries

- SDK 1.8's `media.images` and the existing `images` adapter use the same executor; the new
  namespace is offered only to Apps whose manifest floor is at least 1.8. Studio uses the
  host-injected SDK, and the public exact Platform 0.6.0 pin of the archive encoder is
  independent of this; SDK 1.8 also publishes its types with this Platform npm release.
- The new Cat store is a separate SQLite schema 1, using FULL synchronous / WAL / immediate
  transactions, atomically reserving request identity, policy revision, count and the single
  active job. It does not move existing App Core metadata / original files, and does not
  clear an unknown or corrupt DB. SQLite is lazy-loaded: an older Node host without
  `node:sqlite` still keeps App functionality, and the Cat entry explicitly reports storage
  unavailable.
- The Cat tool is the host `cats` server on the loopback-only
  `/api/internal/cat-image-tools/mcp`; it uses the official session MCP descriptor.
  `image_generate(prompt,caption)` has its request ID derived from the host supervised action;
  `image_status(jobId)` only reads the original job. The bearer does not authorize owner APIs,
  and loses call permission when each turn ends. A public ingress rejects this route even if
  forwarded from loopback.
- If a configured Cat image policy is restricted by expiry, trigger mode, account, binding or
  Runtime capability, the supervised turn receives the safe reason and expiry time for that
  turn; an admission rejection is no longer silently turned into "no platform integration".
  That turn issues no tool grant, and reserves no quota or automatic schedule. Both manual and
  heartbeat verify the policy expiry, and the service does not look at rhythm or time windows.
  The life loop decides the trigger of proactive interaction, and an accepted image is not
  aborted because the Cat falls asleep. The next turn re-checks; on recovery the official
  descriptor is sent again; when restricted, the old descriptor is explicitly replaced,
  including old credentials left in Runtime after a host restart. A non-applicable
  conversation/session still cannot obtain the Cat image scope.
- The owner/admin routes are `/api/cats/:catId/image-policy` and the image / cancel / retry
  under the same Cat. The actor, account, conversation, original binding and revision are all
  resolved by the host; unknown fields are rejected. A partial policy update keeps the
  original binding, and a disabled / invalid account or a removed management role loses
  subsequent execution / outbound rights.
- A job is first durably held, and released only by a successful turn receipt; a lost ack
  recovers only through the host active-turn gate and Runtime's explicit
  `turnInFlight=false` or a definite session 404. Runtime hands off only its own idle source,
  waiting for all owned helpers to stop; it does not seize another Cat's worker or raise the
  pool cap.
- A Cat image attachment contains only the managed ref, hash, MIME and dimensions; the owner
  image route verifies account / owner / Cat scope every time. The image is shown in the
  original conversation, and ordinary transport fanout no longer sends this durable intent on
  its behalf.
- Delivery takes a persistent attempt claim before the side effect. The claim is re-checked
  before and after append, before sending, and after Telegram finishes reading the file; the
  last network boundary re-checks the full owner / Cat / conversation / binding revision. An
  expired sending becomes uncertain and needs an explicit resend; only an explicit API 429 is
  automatically retried a limited number of times. A normal shutdown only drains work already
  started and does not suppress images still waiting to be sent.
- reset goes through a persistent maintenance fence, rejecting active / unconfirmed
  generations and sending / uncertain delivery; the owner can explicitly stop later outbound
  sending of an uncertain one, leaving `abandonedAt` and clearing the old claim; the previous
  result stays uncertain, and only then can reset happen. Cross-process new
  admission / dispatch / delivery is rejected during cleanup.

| Record | Required content |
| --- | --- |
| Trusted caller | `kind: app | cat`, account / actor, trusted App installation or Cat/session, minimal tool grant |
| Cat image policy | policy ID/revision, Cat/account, manual/proactive modes, operation / target, positive-integer daily/total limits, min interval, budget IANA timezone, expiry, enabled/revoked, allowed conversation/binding; no image-generation time-window setting |
| Image intent/job | stable ID/request ID, initiator, trigger source, canonical request/hash, policy snapshot / reservation, Runtime ID, generation state, cancel intent, safe error, output asset |
| Asset | stable ID, owner / origin scope, verified MIME/bytes/dimensions/hash, managed location, sharing grants / references; the public projection contains no path |
| Delivery intent | stable key (job/asset/conversation/binding), immutable payload reference, binding revision, pending/sending/sent/failed/uncertain/suppressed, attempts, Telegram message IDs, safe reason |

By default the policy has no proactive image quota; enabling must pick finite values, and
unset is not replaced by unlimited.
The daily quota is bucketed by date in the policy IANA timezone; the interval is computed from
persistent UTC timestamps. Changing the timezone / policy revision does not reset the
daily / total usage, nor release existing reservations.
In the first phase each Cat has at most one active image job; Studio keeps its existing
per-App/account active and retention limits, and the whole still obeys Runtime's global
single-image and pool/singleton admission.

A reservation across midnight still belongs to the original admission bucket; it can be
atomically released only when trusted evidence proves the provider was not run, and the
release itself is idempotent. An unknown result still occupies the count, and one cannot
generate images repeatedly by restarting, cancelling or changing the policy.
A count limit does not guarantee an amount of money; actual cost is presented only from the
data Runtime reports.

The existing App methods are kept: getCapabilities/list/submit/cancel/refresh/read/export. The
Cat model tools expose only generate and status; the owner can cancel. Download and sending
the image are handled by the host.
The two adapters do not share a scope that the caller can forge. Any additional agent
transport uses the existing controlled session MCP / tool boundary, and does not expose
internal tools directly from the public ingress.

## Result, delivery and failure behavior

Generation state and delivery state are separate. When the image is saved successfully but
Telegram fails, the job is still succeeded and delivery is failed or uncertain; a later retry
does not call the provider again.

- No profile / authorization / capacity, or over quota: the provider is not run, and an
  understandable reason is left. The Cat can stay with text or stay quiet; degraded content
  must not be treated as a generated image, and the target is not switched automatically.
- A heartbeat proposal or model output is not authorization. Generation and delivery must
  each pass the host check.
- Runtime / Platform interruption: query with the same ID. Even if it is definitely not found,
  do not start another attempt on one's own; a POST that might arrive late must be treated as
  still ambiguous.
- Save failure: keep the original receipt so it can be collected again; it must not be
  "repaired" by generating another image.
- Completion, message and intent are deduplicated by stable keys; on a pending/sending
  restart, a Telegram send that had started but is unconfirmed is marked uncertain, not
  returned directly to pending.
- A retry after a definite Telegram failure obeys bounded attempts / retry-after; each time
  the send permission is re-checked. When the binding is invalid or the policy revoked,
  delivery is paused / suppressed; sleep does not revoke an accepted image and does not pick
  another recipient.
- A pending/uncertain asset must remain readable. Deletion must first release the pending
  reference or be explicitly cancelled, and must not leave an intent whose file cannot be
  read on recovery.

## Runtime evaluation

Runtime has confirmed that a minimal resource-handoff extension is needed, still using the
existing image routes and schema 2. See
[Runtime SPEC-038](../../../cats-runtime/docs/specs/SPEC-038-image-generation-contract-2.md)
and [PLAN-048](../../../cats-runtime/docs/plans/PLAN-048-image-generation-contract-2.md).

| Check | Gate |
| --- | --- |
| Existing contract 2 request / receipt / MIME / cancel / restart | Shareable through both adapters; only a host-only `sourceSessionId` is added, with no Cat / App policy fields added |
| Cat chat and image target on different / the same provider instance | Does not synchronously wait on a worker / singleton it holds itself; an unsupported combination is clearly unavailable, and it does not claim every Cat/provider pairing can run |
| Tools and heartbeat/session gate | submit / completion have no re-entrant deadlock; owner messages can continue, and shutdown can stop within bounds |
| Pool full / singleton busy | The original Runtime error maps correctly; it does not preempt arbitrary chats, does not raise the cap automatically, and does not relax execution rules |
| Combinations needing runtime resource handoff | Wait for evidence of the source's actual turn / full process lifetime; regression covers persistent source, helper, abort and old handles |
| Image editing / new provider / new options | Coordinate under Apps PLAN-006; not part of this phase's success criteria |

Runtime does not handle the owner's messaging intent, the App registry, the Cat budget, asset
sharing or Telegram. A Cat is not given Runtime's general credentials merely to avoid
depending on a Studio install.

## Upgrade and compatibility

- The new service takes over Studio's same payload / response, isolation and history IDs under
  the existing SDK. An SDK major or a new App release is not a necessary precondition for a
  purely internal extraction.
- The new caller / policy / asset / delivery records must have a versioned format. Existing
  Studio jobs map to an App initiator, keeping App/account/version, request ID, Runtime ID,
  Core IDs and image hash; no Cat owner, sharing rights or automatic image quota is invented.
- Existing App schema 1 / 2 images are not bulk rewritten. An optional private
  `cancelRequestedAt` is added; an old cancelling receipt infers its cancel intent from the
  original updatedAt, persisted only on the existing Core mutation path; that path keeps the
  snapshot backup / atomic replace. An old interrupted receipt does not fabricate cancel
  evidence. The new Cat store and the old App records have no data migration, and SQLite
  rollback / WAL preserves incomplete atomic updates.
- First verify all sources, create a verifiable backup, stage and verify the new metadata /
  original-file references, then atomically activate; on failure keep the original data and
  provide recovery. A cross-store interruption must be re-entrant, an unknown format is
  refused to open, and one cannot clear and rebuild or re-run an old job.
- App removal / disable still takes effect on the App scope; the existing revocation
  semantics are not cancelled for the shared service.
- If the persisted-data / external contract really has a breaking boundary, record the needed
  boundary and the minimum compatible combination under the 0.x minor / SDK major policy;
  release must still conform to this explicit authorization and the release SOP.

## Acceptance criteria

| ID | Required evidence |
| --- | --- |
| AC-01 | With Studio not installed, an ordinary active companion + limited grant can generate an image through actual tool delivery; a Boss without a grant is rejected, with 0 provider calls |
| AC-02 | Under the same shared service, the existing Studio package's submit / cancel / reopen / offline original-file export stay byte-identical |
| AC-03 | Cross App/account/Cat, forged caller / session / job IDs, or borrowing the Studio scope are all rejected; no raw path or credentials leak |
| AC-04 | Concurrent heartbeat / owner requests, duplicate requests, cross-process restart, crossing midnight / changing timezone never exceed the count, and reservation release is idempotent |
| AC-05 | The same ID with a changed prompt/target/operation conflicts; a lost POST response, a transient GET 404, refresh/reopen add no native invocation |
| AC-06 | Different and same provider instance, busy/full pool, session gate and shutdown have no deadlock; list the pairings that pass and those not yet available |
| AC-07 | Revocation, Cat disable and Studio disable each affect only this scope; cancel precedes a late result, and other callers' jobs are not cancelled |
| AC-08 | One successful generation corresponds to one original file, one logical Cat image message and one delivery intent; a lost event / duplicate completion / restart does not duplicate them |
| AC-09 | A Telegram `failed` receipt is not marked delivered; a definite-failure bounded retry uses the same asset; an ambiguous send stays uncertain, with 0 regenerations |
| AC-10 | After binding rotation / owner sleep / policy revocation / conversation deletion / owner identity change, a late result is not misdelivered; the reply still lands in the same Cat DM |
| AC-11 | After Studio is uninstalled the Cat can still generate images under the original grant, and Studio cannot see the Cat's private images; after explicit sharing, only the shared assets are opened |
| AC-12 | Old Studio originals and all IDs/hash, failure / interrupted states are preserved; malformed, ENOSPC, power loss, restart and unsupported downgrade each have upgrade fixtures |
| AC-13 | Desktop can distinguish not authorized / not configured / busy / generating / generated but not delivered; Settings change errors use Toast; not generated does not claim to have an image |
| AC-14 | An asset with pending/uncertain delivery is not removed by retention; after explicit cancel / cleanup the references are consistent, and arbitrary file reads are not widened |
| AC-15 | The isolated host + built Studio + fixture Runtime + fake Telegram form a full closed loop; another test verifies with real session tool delivery that the Cat can actually call it |
| AC-16 | Acceptance with a real provider / Telegram / installed Desktop must record the version, supported pairings and the owner-approved number of generations; if not run, mark pending, and a research image or fixture cannot substitute |

## Open engineering gates

- [ ] P0 freeze the Cat tool's actual schema / session MCP authorization, the policy defaults
      UI and the management entry.
- [ ] P0 freeze the transaction and cross-process lock boundary of reservation/job/asset/delivery.
- [ ] P0 use isolated fixtures to determine which caller / image target pairings can reuse Runtime.
- [ ] P0 freeze the durable format, upgrade / recovery boundary, and the existing Studio
      package contract matrix.
- [ ] Independent implementation review and the arrangement of per-OS / real-provider acceptance.

These are contract gates before implementation; they do not affect this completion of a
reviewable document, and do not imply implementation approval.

## References

- [ADR-136](../decisions/136-share-controlled-image-capabilities-between-cats-and-studio.md)
- [SPEC-119](SPEC-119-app-image-generation.md), [SPEC-124](SPEC-124-alive-companion-life-loop.md)
- [Apps SPEC-006](../../../cats-apps/docs/specs/SPEC-006-studio-image-workspace.md)
- [Apps PLAN-006](../../../cats-apps/docs/plans/PLAN-006-studio-image-workspace.md)

*Created: 2026-10-23. Documentation only; all new implementation acceptance pending.*
