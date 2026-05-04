# ADR-100: Cats as Canonical Identity With Clowder and Cattery as Membership Associations

## Status

Proposed

## Context

[ADR-099](./099-promote-cats-clowders-catteries-to-platform-entities.md)
promotes Cats, Clowders, and Catteries to first-class platform entities
with canonical top-level URLs. It does not specify how the three relate.
Two questions remain:

1. **Does a Clowder belong to a Cattery?** A Clowder might be:
   - a formal department in a company's org chart (i.e. inside a Cattery), or
   - a cross-unit task force not recorded in any company's org structure,
     possibly including outsiders.

   Both are real and need first-class support.

2. **Can a Cat be a member of a Clowder/Cattery without being a "regular
   employee"?** Yes — temp participants and external collaborators are
   load-bearing cases. A temp participant joins a Clowder for a sprint;
   an external collaborator joins a Cattery as a guest.

The data model must support these without forcing every participant into
the same shape and without making "external collaborator" a second-class
hack.

## Decision

### Cat is the canonical identity. Clowder and Cattery are associations.

A Cat has stable identity that is **not derived from membership**. The
same Cat ID can appear in zero or many Clowders, zero or many Catteries,
with different roles and statuses in each. Removing a Cat from a Clowder
does not delete the Cat; the Cat still exists in any other Clowder /
Cattery it participates in, and at its canonical `/cats/:catId` URL.

### A Clowder optionally belongs to one Cattery.

A Clowder has `parentCatteryId: CatteryId | null`.

- `parentCatteryId !== null`: the Clowder is part of that Cattery's
  formal org chart (a department, a team).
- `parentCatteryId === null`: the Clowder is a **cross-unit task force**
  — standalone, may include cats from any Cattery or none.

A Clowder may not have multiple parent Catteries. Cross-cattery
collaboration is modelled by either (a) a parentless Clowder whose
members come from multiple Catteries, or (b) the same Cat appearing as
external in another Cattery.

### Membership has explicit status, not implicit roles.

Every membership record (Cat in Clowder, Cat in Cattery) carries a
`status` field, not just a `role`:

- `formal`: the participant is part of the recorded structure of the
  Clowder/Cattery. This is the default for "regular members".
- `temp`: temporary participant. Expected to leave; UI can surface "ends
  on" if a date is set.
- `external`: belongs to the participant pool but is not part of the
  Clowder/Cattery's permanent structure — guest collaborators, vendors,
  non-employees.

`role` is orthogonal (`owner` / `admin` / `member` / `lead` / etc.) and
governs permissions; `status` is about organizational classification and
is what the UI surfaces as a chip / badge.

### A Cat may participate in multiple Catteries simultaneously.

The same Cat can be `formal` in Cattery A and `external` in Cattery B at
the same time. Each Cattery owns its own membership record for the Cat;
the records do not synchronize.

### A Clowder's members are not constrained by the parent Cattery's members.

A Clowder may include Cats who are not members of its parent Cattery
(temp / external participation). This makes "ad-hoc cross-unit
collaboration" a property of the Clowder layer, not a workaround.

## Consequences

### Positive

- **Identity is stable**. Removing or restructuring Catteries / Clowders
  does not break Cat URLs or participation history.
- **Cross-unit task forces are first-class** without inventing a
  "shadow Cattery" or making them a special case of an existing Cattery.
- **External collaborator** stops being a second-class hack — it's a
  membership status, not a hidden flag.
- **Temp participants** have a real shape (`status: 'temp'`) that the
  Cattery org-chart UI can filter out cleanly.
- **Cattery org chart** is a clean derivation: the formal Clowders
  (`parentCatteryId === catteryId`) plus formal Cattery members.

### Negative

- **More fields per membership record**. Existing code paths that assume
  flat "is in / is out" boolean membership must learn the
  `formal/temp/external` distinction.
- **Two different "members" surfaces** per entity: Cattery has direct
  members + members-via-formal-Clowders. UI must dedupe by Cat ID and
  decide which surface a Cat appears in if it has both kinds of
  membership.
- **Cross-Cattery participation** opens questions about cross-Cattery
  visibility (can Cattery A see that one of its members is also in
  Cattery B?). Out of scope for this ADR; covered by future privacy /
  ACL ADR.

### Neutral

- The data model is a moderate generalization, not a radical one.
  Slack/Discord users will recognize "guest" / "single channel guest"
  patterns; HRIS users will recognize "contractor" status.

## Alternatives Considered

### Alternative 1: Clowder must belong to a Cattery; cross-unit groups don't exist

- **Pros**: simpler tree; Cattery is always the root of the org chart.
- **Cons**: forces every cross-unit task force to either invent a
  fictitious "Cattery for cross-unit work" or live outside the system.
  Both contradict the stated requirement.
- **Why rejected**: the user explicitly called out cross-unit task
  forces as a real case.

### Alternative 2: Membership is binary (member or not), no status field

- **Pros**: simpler queries; one boolean per relationship.
- **Cons**: temp/external/formal collapse into one bucket. Org chart
  cannot filter to "just employees". Releasing a temp Cat at sprint end
  becomes "remove and re-invite" instead of a status change.
- **Why rejected**: the user specifically called out temp participant
  as a real case; treating it as ordinary membership loses the
  semantics.

### Alternative 3: Clowder may have multiple parent Catteries (many-to-many)

- **Pros**: handles "this team is half Acme, half Beta" without external
  status.
- **Cons**: parent ambiguity for org-chart roll-up; permission inheritance
  gets messy; doubles the surface for a case that's already cleanly
  representable as a parentless Clowder with members from multiple
  Catteries.
- **Why rejected**: parentless Clowder + per-member Cattery affiliation
  covers it without the ambiguity.

### Alternative 4: Cattery and Clowder are the same shape ("group with
optional org-chart status")

- **Pros**: one entity type to maintain.
- **Cons**: collapses two different user mental models (`company` vs
  `team`); URL family becomes awkward; UI loses the obvious "formal
  org" anchor.
- **Why rejected**: the user named them differently for a reason; the
  conceptual distinction is load-bearing.

## References

- [ADR-099](./099-promote-cats-clowders-catteries-to-platform-entities.md)
- [ADR-065](./065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [SPEC-103](../specs/SPEC-103-clowder-and-cattery-data-model.md)
- [SPEC-064](../specs/SPEC-064-my-cats-platform-home-and-lens-projections.md)

---

*Decision made: 2026-05-05*
*Decision makers: User, Claude*
