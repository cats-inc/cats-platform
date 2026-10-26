# SPEC-131: Catlas Curated Assist and Conversation Titles

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
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
When Catlas is off, surfaces show builtin content and titles stay as drafted.
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
- **Snapshot**: the bounded, Platform-built view of the owner's work that
  Catlas receives.
- **Attention set**: the ids in the snapshot's `pendingApprovals`,
  `stalledWork` and `awaitingReply`.
- **Unit**: the part of a Catlas result that applies all-or-nothing, either one
  title or one surface of a refresh.

## Requirements

### Catlas availability

1. FR-1: Platform checks "Catlas active" on the server before every call and
   every render of generated content. Today the assist read model checks only
   `Boolean(guideCat)`.
2. FR-2: While Catlas is inactive, Platform makes no calls.
   - Surfaces render builtin content.
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
13. FR-13: Initial limits per surface, kept as constants in code rather than
    contract:
    - 10 `catlas` greetings and 8 `catlas` chips
    - greetings up to 60 characters, chip labels up to 16 and prompts up to 200

    A unit that would leave zero enabled greetings is rejected.
14. FR-14: The read model sends the enabled greeting pool for the current
    locale. Builtins are translated, and `catlas` items in another locale are
    omitted. The renderer picks one greeting each time a surface opens. An
    empty pool renders the builtin pool.

### Snapshot

15. FR-15: Platform builds the snapshot from existing chat and core state, with
    no new storage:
    - `pendingApprovals`: tasks whose `approval.status` is `pending`
    - `stalledWork`: work items that are `blocked`, or `in_progress` and idle
      for at least 2 days
    - `awaitingReply`: non-archived conversations whose last message has
      `senderKind: 'agent'` and that were active within 14 days
    - `activeProjects`: projects that are `active` or `paused`, with whether
      `repoPath` is set
    - `recentConversations`: the 10 most recently active non-archived
      conversations
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
18. FR-18: `external` is true for a work item with an external binding, which
    means imported or linked from GitHub, Bugzilla or another tracker.

### Recommendations

19. FR-19: Each refresh replaces a surface's recommendations wholesale. A
    recommendation is `{ basis, action: 'open', target }` or
    `{ basis, action: 'prefill', surface, label, prompt }`.
20. FR-20: Validation:
    - every `basis` id is in the snapshot
    - an `open` target is in `basis` and is a conversation, work item, task or
      project that is neither archived nor a DM
    - `prefill` is allowed only when no basis entry is `external`
    - labels and prompts follow FR-13
    - a duplicate target is dropped
    - a draft surface keeps at most 3 recommendations and the Lobby at most 3
      `open` ones
21. FR-21: Platform builds the label of an `open` recommendation from the
    target's current title and a localized verb. Catlas supplies none.
22. FR-22: At render time, Platform drops a recommendation whose basis entries
    no longer qualify under FR-15 to FR-17: completed, archived, deleted or
    replied to.

### Surfaces

23. FR-23: The draft helper row shows at most 5 chips: up to 3
    recommendations, then enabled catalog chips in catalog order. The renderer
    renders this composed list whatever its origin. The rule that renders only
    runtime-origin chips, and the product fallback chip lists, are removed.
    The composed list keeps the `entryChips` field name, so Code keeps
    rendering through the Chat phase, and each phase deletes only its own
    surface's fallback (FR-32 to FR-34).
24. FR-24: A chip whose `surface` differs from the draft's switches the draft
    surface and prefetches it. Chips fill the composer or navigate; they never
    send.
25. FR-25: The Lobby shows up to 3 `open` recommendations below its greeting,
    in Catlas's order. The row is absent when none qualify, and the Lobby shows
    no catalog chips.

### Refresh

26. FR-26: One Catlas call refreshes every adopted surface. It is eligible when
    FR-1 and FR-3 hold and either:
    - the cached bundle is stale under the existing TTL (6 hours by default), or
    - the attention set changed since the last refresh and that refresh is at
      least 30 minutes old.

    Refresh stays non-blocking and queued (`queueGuideCatAssistRefresh`). A
    failure keeps last-good content.
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
    - request id, kind (`title` or `refresh`), provider and model
    - an input digest
    - each unit's outcome (`applied`, or `rejected` with reason codes) and the
      operations applied
    - a timestamp

    The last 100 receipts are kept. Receipts are the inspection surface; there
    is no UI.

### Rollout

32. FR-32: **Chat**:
    - Move Chat's five chips into the `chat:new` builtin catalog; the
      pomodoro chip has `surface: 'code'` and start-project `surface: 'work'`.
    - Delete the hard-coded array and its click closures.
    - Ship titles.
    - Extend `tools/knowledge-practice/catlasEvaluator.mjs` beyond `code:new`.

    The Lobby row follows once `open` exists.
33. FR-33: **Code**: replace the `cross:work:` id prefix with `surface` and
    delete the prefix handling.
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
    Version-1 cache files are discarded and rebuilt, which is the upgrade path
    for a cache.
37. FR-37: `curatedOverrides`, `deterministicSeed` and the seeded greeting pick
    are removed. Nothing ever wrote them, so no migration is needed, and the
    config normalizer drops them if present.
38. FR-38: `titleSource` is additive: an absent value reads `manual`, and no
    existing data is rewritten. The release notes state what an active Catlas
    sends to its bound provider (FR-9, FR-15). The version follows the release
    guide; no persisted-data requirement breaks.

### Non-Functional Requirements

- **Security**: All validation runs on the server. Chips never send. External
  text reaches Catlas only as flagged titles and never becomes a Catlas-authored
  prompt.
- **Privacy**: Everything stays local except what FR-9 and FR-15 send to
  Catlas's bound provider, and nothing is sent while Catlas is inactive.
- **Cost**: At most two title calls per conversation. Refreshes happen at most
  every 30 minutes on attention changes, and otherwise per TTL.
- **Compatibility**: Shared shapes change through integration review (see
  Dependencies).

## Design Overview

```
chat + core state ──► snapshot (bounded, external-flagged, cooldown-filtered)
                              │
catalog + locale ─────────────┤
                              ▼
               Catlas call (read-only, no tools, JSON out)
                              │
                              ▼
        validate per unit ──► atomic write (catalog, recommendations, title)
                              │                      │
                              ▼                      ▼
                       read model                 receipt
   (enabled greeting pool, composed chips, render-time revalidation)
                              │
                              ▼
         renderer: greeting pick, helper row (≤5), Lobby row (≤3 open)
                              │
                              ▼
                 feedback (accepted / dismissed) ──► cooldown
```

## Verification

1. **Snapshot builder.** Fixture state yields an exact snapshot, covering the
   exclusions, caps, `external` flags and cooldown.
2. **Validator and apply.** A fake runtime client returns fixed envelopes,
   and each of these is rejected:
   - builtin removal
   - a cap overrun
   - zero enabled greetings
   - an unknown basis id
   - `prefill` on an external basis
   - `open` on a DM or an archived record
   - one bad operation, which rejects its whole unit
   - a title write after a rename (compare-and-set)
3. **Read model.** These hold:
   - a dismissed Catlas renders builtins
   - locale filtering
   - render-time revalidation
   - the Lobby cap and the empty Lobby row
4. **Upgrade.** These hold:
   - a version-1 cache is discarded
   - a config with `curatedOverrides` or `deterministicSeed` normalizes
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

## Open Questions

- [ ] Does the Chat phase ship under today's Catlas posture (read-only sandbox,
      rejection after the fact, the snapshot rules), or wait for the
      cats-runtime tool-less option?
- [ ] Are the initial constants right: 5 chips including 3 recommendations,
      30-minute attention refresh, 7-day cooldown, and the FR-13 caps?
- [ ] Should dismissing Catlas also delete its stored generated content? FR-2
      keeps it for reactivation.

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
*Author: Claude (with the owner)*
*Related Plan: to follow approval*
