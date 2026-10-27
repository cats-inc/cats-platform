# SPEC-131: Catlas Curated Assist and Conversation Titles

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented; scoped validation passed; live-model quality pending |
| **Owner** | Owner |
| **Reviewer** | Owner |
| **Related ADR** | [ADR-140](../decisions/140-let-catlas-curate-assist-content-and-titles-through-host-validated-output.md) |

## Summary

When Catlas is active, it titles new conversations after their first reply,
curates each surface's greetings and helper chips, and recommends what the owner
is likely to want to do next. Recommendations are grounded in what is waiting
on the owner: pending approvals, stalled work, conversations awaiting a reply
and active projects. Catlas returns data from a read-only, tool-less call.
Platform validates each result, applies it atomically, and keeps a receipt.
When Catlas is off, surfaces show builtin content with preserved owner
configuration applied, and titles stay as drafted.
This is the runtime-backed generation that
[SPEC-067](SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)
deferred, under the authority rules of
[ADR-140](../decisions/140-let-catlas-curate-assist-content-and-titles-through-host-validated-output.md).

## Goals

- A new conversation gets a short title that names its subject.
- Greetings rotate, and the owner sees a different line from time to time.
- The helper row offers one or two things the owner actually has pending,
  alongside generic starters.
- Every Catlas effect can be traced to a receipt, and every rule is enforced by
  Platform rather than by prompt text.

## Non-Goals

- Web search, feeds or current events.
- An owner-facing editor for catalogs, recommendations or receipts.
- Optimizing chips for click-through.
- Titles for Parallel Chat groups, and changes to mobile chips or greetings.
- New Catlas tools, write routes or authority.

## Terms

- **Catlas active**: `core.guideCat` is non-null and its `status` is not
  `dismissed`.
- **Surface**: an assist scope. This spec adopts `lobby:default:default`
  (greetings and recommendations only), `chat:new:default:default`,
  `code:new:default:default` and a new `work:new:default:default`.
- **Catalog**: a surface's greeting items and chip items, each `builtin` or
  `catlas` in origin and each enabled or not.
- **Recommendation**: a chip generated for one refresh. It cites `basis` ids
  from the snapshot and either opens a record or prefills a composer.
- **Snapshot**: the bounded, Platform-built view of the owner's work. Platform
  derives a prompt-generation input containing internal records only and a
  navigation input that may also contain externally sourced records (FR-18).
- **Attention set**: the ids in the snapshot's `pendingApprovals`,
  `stalledWork` and `awaitingReply`.
- **Unit**: the part of a Catlas result that applies all-or-nothing, either one
  title or one surface's result from one refresh call kind. Prompt-generation
  and navigation results are separate units and stored separately.

## Requirements

### Catlas availability

1. FR-1: Platform checks "Catlas active" on the server before every call and
   every render of generated content. Today the assist read model checks only
   `Boolean(guideCat)`.
2. FR-2: While Catlas is inactive, Platform makes no calls.
   - Surfaces render builtin content with any preserved owner configuration
     applied (FR-37).
   - Drafted titles stay.
   - Stored generated content is kept but not rendered.
3. FR-3: A call also requires the runtime to be reachable and
   `refreshPreferences.runtimeRefreshEnabled`. A surface in
   `disabledSurfaceKeys` is neither refreshed nor rendered with generated
   content.

### Calls and validation

4. FR-4: Every call uses the `inferCatlasAdvice` session shape:
   - one fresh session on Catlas's binding
   - `workspaceKind: 'sandbox'`, `workspaceAccess: 'read_only'`, no skills and
     no session MCP servers
   - instructions that forbid tools and treat JSON input as data
   - one strict JSON envelope as output
   - rejection of a response that contains any non-text segment
   - the session closed afterwards

   Once cats-runtime offers a tool-less session option, calls request it.
   Prompt-generation and navigation refreshes always use separate fresh
   sessions, without shared history or model-output handoff. Their record
   inputs may overlap only on internal records. External titles, navigation
   transcripts, receipt text and host-built navigation labels never enter the
   prompt-generation session. A model-supplied `basis` is a relevance claim,
   not proof of where its output text came from.
5. FR-5: Platform validates the envelope, and an unknown field rejects its
   unit. Each unit applies all-or-nothing in one atomic write. A rejected unit
   leaves the last applied state in place.
6. FR-6: Catlas never chooses ids. Platform assigns ids to added items, and
   operations reference ids taken from the input.

### Titles

7. FR-7: `ChatChannelState` gains
   `titleSource: 'draft' | 'catlas' | 'manual'`.
   - `draft`: a composer derived the title. The desktop draft takes the first
     48 characters of the first message; mobile non-DM drafts use the
     entry-action title.
   - `catlas`: written under FR-9.
   - `manual`: set by an owner rename or by any other creator, such as Code
     sessions, collaboration, Telegram or Parallel Chat members.
   - An absent value reads as `manual`, so existing conversations are never
     retitled.
8. FR-8: A conversation is eligible when all of these hold:
   - it is non-DM
   - `titleSource` is `draft`
   - Catlas is active
   - its first assistant reply has completed

   Each conversation gets one attempt. After a failure, one more attempt
   follows the next completed reply, then none.
9. FR-9: The call receives the first owner message and the first reply, each
   truncated to 2,000 characters, plus the locale. It returns
   `{"title": string}`. Platform then:
   - trims the title, collapses whitespace and strips control characters
   - rejects an empty title and caps it at 48 characters
   - writes only while `titleSource` is still `draft`, as a compare-and-set,
     and sets `titleSource` to `catlas`
10. FR-10: A rename through `PATCH /api/channels/:id` sets `manual`. Catlas
    never retitles a `catlas` title.

### Catalog

11. FR-11: Each adopted surface has a catalog.
    - Greeting item: `{ id, origin, enabled }` plus a message key for a
      `builtin` item, or `text` and `locale` for a `catlas` item.
    - Chip item: `{ id, origin, enabled, surface }` plus message keys for a
      `builtin` item, or `label`, `prompt` and `locale` for a `catlas` item.
    - `surface` is `chat`, `code` or `work`.
    - The Lobby catalog holds greetings only.
12. FR-12: Builtin items are defined in code and cannot be removed. Catlas
    operations are:
    - `add`: a greeting or a chip
    - `remove`: `catlas` items only
    - `enable` and `disable`: any item

    These operations are accepted only from the prompt-generation call. That
    call sees no external record text. Preserved owner configuration (FR-37)
    is outside this operation list; Catlas cannot edit, remove or disable it.
13. FR-13: Initial limits per surface, kept as constants in code rather than
    contract:
    - 10 `catlas` greetings and 8 `catlas` chips
    - greetings up to 60 characters, chip labels up to 16 and prompts up to 200

    A unit that would leave zero enabled greetings is rejected.
14. FR-14: The read model sends the enabled greeting pool for the current
    locale. Builtins are translated, and `catlas` items in another locale are
    omitted. The renderer picks one greeting each time a surface opens. An
    empty pool renders the builtin pool. A preserved owner greeting selection
    takes precedence over rotation (FR-37).

### Snapshot

15. FR-15: Platform builds the snapshot from existing chat and core state, with
    no new storage:
    - `pendingApprovals`: tasks whose `approval.status` is `pending`
    - `stalledWork`: work items that are `blocked`, or `in_progress` and idle
      for at least 2 days
    - `awaitingReply`: non-archived conversations active within 14 days whose
      latest completed assistant turn presents non-empty structured `choices`,
      with no `choiceResponse` referring to that choice message and no later
      owner message. A later owner message counts as a response even when it
      answers in free text. Superseded choices do not qualify. An ordinary
      assistant answer, completion notice or unstructured question does not
      make a conversation pending; it may appear in `recentConversations`.
    - `activeProjects`: projects that are `active` or `paused`, with whether
      `repoPath` is set
    - `recentConversations`: at most 5 entries selected from the 10 most
      recently active non-archived conversations (the FR-16 exposure cap)
    - `context`: the current time, weekday, daypart, locale and owner display
      name
16. FR-16: Each entry carries its id, kind, title, status, surface, idle days
    and an `external` flag, and nothing else. Message bodies and record
    summaries are never included. Each category holds at most 5 entries.
17. FR-17: The snapshot excludes:
    - chat channels whose `channelKind` is `direct_message`, and core
      conversations (`CoreConversationRecord`) of kind `private_escalation` or
      `external_transport`
    - completed, cancelled and archived records
    - ids in cooldown (FR-29)
18. FR-18: Platform derives `external`; Catlas cannot choose or clear it.
    - It is true for both projects and work items with an external binding or
      external-import provenance, including GitHub, Bugzilla and other trackers.
    - Tasks and other derived records inherit it when their title/context came
      from an external work item or project through the existing planning links.
      Unlinking a tracker alone does not erase known external provenance.
    - Records whose internal origin cannot be established are navigation-only.
    - The prompt-generation input omits these records entirely, including their
      titles, identifiers and summaries. Its catalog input also omits navigation
      output. It may return catalog operations and internal `prefill`
      recommendations only.
    - The navigation input may include the full eligible snapshot. Its fresh
      session may return ordered `{ basis, action: 'open', target }` records
      only. Text fields, `prefill` and catalog operations are rejected.

    Platform builds these inputs before calling Runtime. Filtering output by
    self-reported basis ids, or instructing the model to ignore external text,
    does not replace this separation.

### Recommendations

19. FR-19: Each refresh call replaces only its own per-surface recommendation
    list; it cannot overwrite the other call kind's list. A
    recommendation is `{ basis, action: 'open', target }` or
    `{ basis, action: 'prefill', surface, label, prompt }`.
20. FR-20: Validation:
    - `basis` is non-empty and every id is in that call's Platform-built input
    - an `open` target is in `basis` and is a conversation, work item, task or
      project that is neither archived nor a DM
    - `prefill` and catalog operations are allowed only from the
      prompt-generation call, whose input excludes external and unknown-origin
      records; a navigation response cannot acquire this permission by citing
      an internal id
    - labels and prompts follow FR-13
    - a duplicate target is dropped
    - the cap applies after merging both call kinds: a draft surface keeps at
      most 3 recommendations and the Lobby at most 3 `open` ones
21. FR-21: Platform builds the label of an `open` recommendation from the
    target's current title and a localized verb. Catlas supplies none.
22. FR-22: At render time, Platform drops a recommendation whose basis entries
    no longer qualify under FR-15 to FR-17: completed, archived, deleted or
    replied to. It rechecks external provenance under FR-18; a previously
    internal basis that becomes external or unknown no longer permits a
    `prefill`. Choice eligibility uses the same unresolved-choice predicate as
    the snapshot builder, not the last message's sender kind.

### Surfaces

23. FR-23: The draft helper row shows at most 5 chips: up to 3
    recommendations, then enabled catalog chips in catalog order. The renderer
    renders this composed list whatever its origin. The rule that renders only
    runtime-origin chips, and the product fallback chip lists, are removed.
    Draft recommendations interleave the navigation and prefill lists,
    starting with navigation and preserving each list's order, then apply the
    cap. The Lobby consumes the navigation list only.

    The composed list keeps the `entryChips` field name, but its entries are a
    discriminated union: `open` entries have a target and host-built label;
    `prefill` entries have a prompt and surface. Consumers must branch on the
    action before reading `prompt`. The Chat phase updates every existing
    consumer of the changed shared shape in the same deployable change,
    including Code's chip and greeting readers. An `open` item must never
    reach Code's current unconditional `chip.prompt.trim()` path. No legacy
    payload alias or dummy prompt is introduced. Content-generation adoption
    still proceeds Chat, Code, Work (FR-32 to FR-34).
24. FR-24: A chip whose `surface` differs from the draft's switches the draft
    surface and prefetches it. Chips fill the composer or navigate; they never
    send.
25. FR-25: The Lobby shows up to 3 `open` recommendations below its greeting,
    in Catlas's order. The row is absent when none qualify, and the Lobby shows
    no catalog chips.

### Refresh

26. FR-26: One refresh job covers the surfaces whose generation has been
    enabled in the current rollout phase. It makes at most two fresh calls:
    a prompt-generation call and, when open candidates exist, a navigation
    call, with the separated inputs and output permissions in FR-18. Updating
    a consumer for shared-shape compatibility does not enable generation for
    its surface. The job is eligible when
    FR-1 and FR-3 hold and either:
    - the cached bundle is stale under the existing TTL (6 hours by default), or
    - the attention set changed since the last refresh and that refresh is at
      least 30 minutes old.

    Refresh stays non-blocking and queued (`queueGuideCatAssistRefresh`). A
    failure keeps last-good content for the failed call kind; a successful
    result never copies the other kind's text into its own input or catalog.
    Read-time validation and the combined recommendation cap still apply.
27. FR-27: The refresh context hash adds the locale. Snapshot content and
    feedback never enter it, because it governs cache invalidation
    (`cacheRefreshContextDrift`).

### Feedback

28. FR-28: `state/guide-cat-assist-signals.local.json` records `accepted` and
    `dismissed` events per basis id.
    - **Accepted**: a `prefill` recommendation's prompt was sent as the first
      message, edited or not, or an `open` recommendation was clicked.
    - **Dismissed**: the helper row or Lobby row was dismissed while the
      recommendation was shown.
29. FR-29: A dismissed basis id stays out of the snapshot for 7 days.
    Retention is 30 days. The file stores ids and timestamps only.
30. FR-30: The renderer reports feedback with a fire-and-forget request that
    does not refetch the app shell.

### Receipts

31. FR-31: Each call records a receipt in `state/catlas-receipts.local.json`:
    - request id, kind (`title`, `refresh_prompt` or `refresh_navigation`),
      provider and model
    - an input digest
    - each unit's outcome (`applied`, or `rejected` with reason codes) and the
      operations applied
    - a timestamp

    The last 100 receipts are kept. Receipts are the inspection surface; there
    is no UI.

### Rollout

32. FR-32: **Chat**:
    - Ship the shared schema/read-model changes together with all existing
      consumers. Code reads action-discriminated chips and greeting pools,
      uses the explicit chip `surface`, and drops the `cross:` prefix parsing
      in this integration change. Its five builtin starters keep their
      behavior; Code curation and recommendations remain off until FR-33.
      Work's existing hard-coded starters remain until FR-34.
    - Move Chat's five chips into the `chat:new` builtin catalog; the
      pomodoro chip has `surface: 'code'` and start-project `surface: 'work'`.
    - Delete the hard-coded array and its click closures.
    - Ship titles.
    - Extend `tools/knowledge-practice/catlasEvaluator.mjs` beyond `code:new`.

    The Lobby row follows once `open` exists.
33. FR-33: **Code**: enable `code:new` catalog curation and recommendations on
    the reader already upgraded in FR-32. Remove remaining Code-only fallback
    or id-based copy rewriting that would override generated content.
34. FR-34: **Work**: add the `work:new` scope with its five chips and its own
    greeting copy, and delete the hard-coded array. Work drafts currently fall
    back to the generic draft greeting lines.

### Data and release

35. FR-35: New state files sit beside `guide-cat-assist-cache.local.json`, each
    with its own `schemaVersion`:
    - catalog: `guide-cat-assist-catalog.local.json`
    - signals and receipts, as above

    A missing file means empty. A corrupt file is renamed `.corrupt-<time>` and
    rebuilt empty, since its content is generated and regenerable.
36. FR-36: The cache moves to `schemaVersion` 2. `GuideCatAssistContent`
    carries the greeting pool and the composed chips instead of one greeting.
    Recognized version-1 generated cache files may be rebuilt after owner
    configuration has been preserved under FR-37. Unknown versions are kept
    intact with a diagnostic. Cache rebuilding is not configuration migration,
    and the new cache is deployed only with the updated consumers (FR-32).
37. FR-37: Config moves to `schemaVersion` 2 through a bounded one-time
    migration, before a normalizer can drop any old fields.
    - Existing `curatedOverrides` become per-scope owner overrides in config,
      retaining greeting text and the complete chip list, including explicit
      empty lists. Platform resolves each chip's product from its old scope
      and supported `cross:<surface>:` id convention into the new explicit
      `surface`; a missing label keeps the old prompt-as-label behavior.
    - A non-empty `deterministicSeed` becomes the equivalent owner-pinned
      builtin greeting selection for existing scopes without a greeting
      override. The old seeded execution path is then removed. Explicit
      overrides keep their precedence.
    - These owner values remain in config, outside regenerable catalog/cache
      state. The host applies them after catalog selection, including while
      Catlas is off, and never offers their ids to Catlas mutation operations.
      No owner-facing editor is added.
    - Preserve disabled scopes, refresh preferences and the effective content
      selection. Validate the entire conversion, back up the original, write
      atomically and verify. Restart/retry must be idempotent. Unknown scopes,
      invalid data or any conversion/verification failure preserve the original
      and expose a diagnostic; they must not normalize to empty defaults.
    - Absence of a production write route is not evidence that config fields
      are empty. Test both empty and populated previous-version profiles.
38. FR-38: `titleSource` is additive: an absent value reads `manual`, and no
    existing data is rewritten. The release notes state what an active Catlas
    sends to its bound provider (FR-9, FR-15). The version follows the release
    guide. A transparent, lossless FR-37 conversion does not by itself require
    a breaking release. If a supported configuration cannot be preserved,
    record the next-minor boundary before implementation/release; do not
    silently discard it. This spec authorizes no version bump or publication.

### Non-Functional Requirements

- **Security**: All validation runs on the server. Chips never send. External
  tracker text is excluded from prompt-generating refresh sessions; sessions
  allowed to read it can return navigation ids only, never prompts or catalog
  mutations. Model-reported basis ids do not grant permissions.
- **Privacy**: Everything stays local except what FR-9 and FR-15 send to
  Catlas's bound provider, and nothing is sent while Catlas is inactive.
- **Cost**: At most two title calls per conversation and two calls per refresh
  job. Refresh jobs happen at most every 30 minutes on attention changes, and
  otherwise per TTL; navigation is skipped when it has no candidates.
- **Compatibility**: Shared shapes change through integration review (see
  Dependencies).

## Design Overview

```
chat + core state ──► snapshot (bounded, provenance-checked, cooldown-filtered)
                         │                              │
                 internal records only         eligible navigation records
                  + catalog + locale           (may include external titles)
                         │                              │
                         ▼                              ▼
                fresh prompt session           fresh navigation session
                catalog ops + prefill          open targets/basis ids only
                         │                              │
                         └────► validate by call kind ◄──┘
                                        │
                               atomic apply per unit ──► receipt
                                        │
                   owner config ──► composed read model
                  (greeting pool, merged chips, render-time revalidation)
                                        │
                renderer: greeting pick, helper row (≤5), Lobby (≤3 open)
                                        │
                    feedback (accepted / dismissed) ──► cooldown

title: first exchange ──► separate fresh session ──► validate + compare-and-set
```

## Verification

1. **Snapshot builder.** Fixture state yields an exact snapshot, covering the
   exclusions, caps, `external` flags and cooldown. Include externally bound
   projects, imported work items, derived tasks and unknown origins; none
   reaches a prompt-generation request. A completed Q&A is not awaiting reply;
   an unresolved structured choice is, until a matching choice response, later
   free-text owner reply or superseding assistant turn clears it.
2. **Validator and apply.** A fake runtime client returns fixed envelopes,
   and each of these is rejected:
   - builtin removal
   - a cap overrun
   - zero enabled greetings
   - an unknown basis id
   - an empty basis or an id absent from that call's input
   - `prefill`, a text field or catalog mutation in a navigation response,
     including one that cites an internal id
   - a prompt-generation response citing an external or unknown-origin id
   - any attempted mutation of preserved owner configuration
   - `open` on a DM or an archived record
   - one bad operation, which rejects its whole unit
   - a title write after a rename (compare-and-set)
3. **Read model.** These hold:
   - a dismissed Catlas renders builtins
   - locale filtering
   - render-time revalidation
   - the Lobby cap and the empty Lobby row
   - reclassification of an internal basis as external removes its prefill
   - combined caps after both call kinds return, and independent last-good
     retention when one fails
   - a Chat-phase fixture with Code's five builtins plus an `open` entry renders
     and navigates without reading a missing prompt; greeting pools and explicit
     cross-surface targets work before Code curation is enabled
4. **Upgrade.** These hold:
   - a recognized version-1 generated cache can be rebuilt after owner config
     migration; an unknown version remains intact
   - populated overrides, empty chip overrides, seeded greeting selection,
     disabled scopes and refresh preferences retain their effective behavior
   - owner overrides survive Catlas dismissal and generated-cache rebuilding
   - backup, atomic replacement, repeated startup and interrupted/failed
     conversion recover without dropping the original config
   - unsupported scopes or invalid data stop conversion with a diagnostic
   - a channel without `titleSource` reads `manual`
5. **Model evaluation.** `catlasEvaluator.mjs` gains workspace-state fixtures:
   a pending approval, a blocked item, a conversation awaiting a reply and idle
   projects. The rubric checks that:
   - every basis id is real
   - pending and blocked items rank above idle projects
   - labels and prompts name the item

   These are manual practice runs, not CI, with the evaluator frozen through
   `freezeEvaluator.mjs`.

## Dependencies

- Shared shapes that cross product trees and need integration review:
  - `src/shared/guideCatAssist.ts`: chip `surface`, content, scope keys
  - `src/shared/guideCatAssistStore.ts`
  - draft chip rendering in `src/products/shared/renderer`
  - `ChatChannelState.titleSource` in `src/products/chat/api/contracts.ts`
  - route wiring in `src/app/server/**`
- `mobile/src/renderer/hooks/useDraftChannel.ts` sets `titleSource`.
- cats-runtime: a provider-neutral tool-less session option (ADR-140 §9).
- The Catlas binding (`GuideCatRecord.executionTarget`, `modelSelection`).

## Implementation notes (2026-10-27)

- Chat, Code, Work and Lobby now consume one composed assist model. Open chips
  receive a host-built `href` after target revalidation; models cannot return it.
  Background completion notifies draft readers; Lobby uses its existing polling.
- Local planning creation establishes `metadata.contentOrigin`; inherited external
  or unknown provenance is preserved through later link changes. Existing records
  without provable internal provenance remain navigation-only. No preference
  profile or message-body store is introduced.
- Config v1 conversion preserves owner greeting/chip overrides, explicit empty
  chip lists, seeded greeting selection, disabled scopes and refresh preferences.
  It validates, backs up, atomically replaces, verifies and restores on failure.
- Conversation attempts are durable channel metadata; title writes compare both
  title source and current Catlas binding inside the atomic Chat/Core mutation.
- The action-discriminated assist JSON and greeting-pool response replace the old
  response shape. The owner subsequently selected **Desktop 0.11.1 standard
  preview** on 2026-10-27, explicitly overriding the earlier **0.12** planning
  boundary. Custom assist readers must adopt the new shape; the public App SDK
  is unchanged. Owner-config migration remains lossless and protected.
- Model-practice attention fixtures and evaluator now cover all three drafts.
  Frozen-evaluator plumbing and fake Runtime tests do not prove live-model quality.
  See [PLAN-123](../plans/PLAN-123-catlas-curated-assist-rollout.md) for actual checks.

## Open Questions

- [x] Ship under the existing read-only sandbox posture. The owner authorized
      implementation on 2026-10-27; no new tools are granted. A future
      provider-neutral tool-less option still belongs to cats-runtime.
- [x] Start with the specified constants: 5 chips including 3 recommendations,
      30-minute attention refresh, 7-day cooldown and the FR-13 caps. Binding
      changes and the configured TTL can refresh sooner; failed calls are
      throttled for 30 minutes without replacing last-good content.
- [x] Keep generated content for reactivation. Dismissal suppresses calls and
      generated rendering; Platform data reset removes generated files.

## References

- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-066](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)
- [ADR-132](../decisions/132-separate-participants-audience-and-the-orchestrator-binding.md)
- [ADR-140](../decisions/140-let-catlas-curate-assist-content-and-titles-through-host-validated-output.md)
- [SPEC-060](SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-067](SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)
- [SPEC-117](SPEC-117-cats-self-development-and-catlas-practice.md)

---

*Created: 2026-10-27*
*Updated: 2026-10-27 — implementation, scoped checks and isolated Windows Desktop
smoke recorded in PLAN-123; live-model quality and packaged acceptance pending.*
*Author: Claude (with the owner)*
*Related Plan: [PLAN-123](../plans/PLAN-123-catlas-curated-assist-rollout.md)*
