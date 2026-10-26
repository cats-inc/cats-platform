# ADR-140: Let Catlas Curate Assist Content and Titles Through Host-Validated Output

## Status

Accepted direction, 2026-10-27. The owner set the direction in a design
discussion:

- Catlas titles conversations.
- Catlas curates greetings and helper chips, without deleting builtins.
- Catlas recommends what the owner is likely to want to do next.
- Catlas gets no web or current-events access.
- There is no settings page for any of it.
- Rollout runs Chat, then Code, then Work.
- The Lobby shows at most three recommendations.

The mechanism that makes this safe (operation lists, basis ids, caps, cooldown
and the external-text rule) is specified by
[SPEC-131](../specs/SPEC-131-catlas-curated-assist-and-conversation-titles.md)
and awaits owner review. This record builds on
[ADR-061](061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
and [ADR-066](066-persist-guide-cat-assist-content-as-platform-owned-local-state.md),
which stand unchanged, and takes up the runtime-backed generation that
[SPEC-067](../specs/SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)
deferred.

## Context

- **Titles are the first 48 characters of the first message**
  (`createDraftChannelTitle` in
  `src/products/shared/renderer/workspaceChatUtils.tsx`). Mobile non-DM drafts
  use a generic entry title. Provider CLIs set summarized terminal titles only
  in interactive mode. Runtime runs Claude Code in print mode and Codex through
  `app-server`, with no terminal: runtime-driven Claude transcripts on the
  owner's machine carry no `ai-title` entries, and Runtime does not subscribe to
  Codex's `thread/name/updated`. A room also has one provider session per
  participant, while its title belongs to the room. Provider titles cannot be
  the source
  ([research note](../research/2026-10-27-provider-cli-session-titles.md)).
- **Greetings do not rotate.** Each surface has a builtin pool, but the pick is
  derived from `deterministicSeed`, which nothing writes, so each surface always
  shows the same line.
- **The assist config cannot express curation.** `GuideCatAssistConfigFile` can
  only disable a whole surface or replace its content (`curatedOverrides`), and
  nothing outside the store calls `writeGuideCatAssistConfig`.
- **Nothing is generated.** `refreshGuideCatAssistEligibleScopes` rehydrates
  baselines and records `skipped`.
- **Chips have three implementations.**
  - Chat and Work hard-code them in renderer components; Chat switches surface
    with click closures.
  - Code keeps them in its baseline and switches surface with a `cross:work:`
    id prefix.
  - `GuideCatAssistEntryChip` has no surface field.
- **Catlas already has a safe call shape.** `inferCatlasAdvice` opens one
  read-only sandbox session, forbids tools, rejects any non-text segment,
  accepts a strict JSON envelope and closes the session.
- **Who writes is already decided.**
  [ADR-132](132-separate-participants-audience-and-the-orchestrator-binding.md)
  §1: people own conversations and agents work. §4: the first recipient carries
  no extra responsibility. A coordinator routes; it does not own conversation
  metadata.

## Decision

1. **Catlas does the work; Platform writes.** Catlas generates titles,
   curates greeting and chip catalogs, and recommends next actions. It returns
   data only. Platform validates every result and applies it. Catlas gains no
   tool, no write route and no authority beyond the conversation
   (ADR-132 §1, §6).
2. **Catlas off means builtins.** When Catlas is absent or dismissed, nothing
   is generated and nothing generated renders: titles stay as drafted, and
   surfaces show builtin content.
3. **Titles.** A conversation started from a composer draft is eligible for one
   Catlas title after its first reply. Platform writes it only while the title
   is still the drafted one. An owner rename, or a title set by any other
   creator, is never replaced. DMs are excluded.
4. **Catalogs.**
   - Each surface has a catalog of greetings and chips.
   - Builtin items cannot be removed but may be disabled. Catlas may add items,
     remove its own, and enable or disable any item, within caps.
   - Greetings rotate among enabled items.
   - A chip names its surface: `chat`, `code` or `work`.
   - The catalog is generated state with no owner-facing editor. Disabling
     Catlas is the owner's control.
5. **Recommendations are grounded in the owner's own work.**
   - Platform supplies a snapshot of what is waiting on the owner: pending
     approvals, blocked or stale work, conversations awaiting a reply, and
     active projects.
   - Each recommendation cites basis ids from that snapshot, or Platform drops
     it.
   - Two actions exist: `prefill` fills a surface's composer, and `open`
     navigates to an existing record. Nothing is ever sent automatically.
   - A dismissed recommendation's basis cools down.
6. **External text never becomes a Catlas-authored prompt.**
   - Records imported or linked from an external tracker reach Catlas only as
     titles flagged external. A recommendation based on one may only `open`.
   - DMs, private escalations and external-transport conversations are not in
     the snapshot.
   - Platform builds the label of an `open` recommendation from the target's
     current title; Catlas supplies none.
7. **Minimal inputs, no web.** The snapshot carries ids, titles, statuses,
   surfaces and idle time. It carries no message bodies or record summaries;
   the title call is the one exception and receives the first exchange. Catlas
   gets no web search or feed, so topical content is out of scope.
8. **Rollout.** Chat, then Code, then Work. The Lobby shows at most three
   `open` recommendations and nothing when there are none.
9. **Tool-less sessions belong to cats-runtime.** Today "no tools" is an
   instruction plus rejection after the fact, and the provider sandbox, which
   differs per provider, is the real boundary. A
   provider-neutral tool-less session option belongs to cats-runtime, and
   Catlas calls use it once it exists. SPEC-131 leaves to the owner whether the
   Chat phase waits for it.

## Consequences

### Positive

- Titles become meaningful without depending on provider behavior.
- One catalog model replaces three chip implementations and a fixed greeting.
- Recommendations are specific and checkable: Platform rejects any suggestion
  that cites nothing the owner is working on.
- Catlas's authority does not grow. Every effect is a validated write, and
  disabling Catlas removes all of them.

### Negative

- Catlas sees titles and statuses across the workspace, wider than any
  participant does, and its bound provider receives them.
- Each title and each refresh costs a Catlas session; CLI providers spend quota
  and seconds.
- Chip, bundle and refresh shapes change across product trees and need the
  integration review the parallel-delivery rules require.

### Neutral

- ADR-061's capability framing and ADR-066's config/state split stand.
- Work gains greeting copy of its own.

## Alternatives Considered

### Read titles from provider CLIs

- **Pros**: No extra model call.
- **Cons**: Absent in non-interactive modes, provider-specific, and one per
  participant session.
- **Why rejected**: It cannot produce one title per room.

### Let the coordinator or the first audience member title the conversation

- **Pros**: No Catlas dependency.
- **Cons**: The coordinator binding is optional, and the call would enter a
  participant's session. ADR-132 §4 gives the first recipient no extra
  responsibility.
- **Why rejected**: A title is owner metadata, not participant work.

### Give Catlas write tools

- **Pros**: More flexible behavior.
- **Cons**: Its authority grows, and invariants become prompt text.
- **Why rejected**: Platform can enforce every rule on returned data.

### Optimize chips for click-through

- **Pros**: Simple counters.
- **Cons**: It optimizes for clicks rather than for useful work.
- **Why rejected**: The owner asked for recommendations of what they are likely
  to want to do.

### Let Catlas use current events

- **Pros**: Livelier copy.
- **Cons**: It needs web access, and web text could reach prompts sent to agents
  with shell access.
- **Why rejected**: The owner kept Catlas's privileges minimal for now.

## References

- [ADR-061](061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-066](066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)
- [ADR-093](093-use-platform-language-preferences-for-assistant-and-ui-locales.md)
- [ADR-132](132-separate-participants-audience-and-the-orchestrator-binding.md)
- [SPEC-060](../specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-067](../specs/SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)
- [SPEC-131](../specs/SPEC-131-catlas-curated-assist-and-conversation-titles.md)

---

*Decision made: 2026-10-27*
*Decision maker: Owner*
*Documented by: Claude*
