# SPEC-103: Clowder and Cattery Data Model and Membership Semantics

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Accepted (2026-11-16) |
| **Owner** | Claude |
| **Reviewer** | User |
| **Related ADR** | [ADR-100](../decisions/100-cats-as-canonical-identity-with-clowder-and-cattery-as-associations.md) |
| **Parent ADR** | [ADR-099](../decisions/099-promote-cats-clowders-catteries-to-platform-entities.md) |

## Summary

Defines the data model, membership semantics, query rules, and surface
implications for Clowders (task force groups) and Catteries (company
organizational structures), with Cats as the canonical identity layer.
Implements the principles set in ADR-100.

## Conceptual Model

```
Cat (canonical identity)
  ├─ owns 0..N memberships in Clowders
  └─ owns 0..N memberships in Catteries

Clowder (task force / group)
  ├─ parentCatteryId: CatteryId | null   (null → cross-unit)
  └─ members: ClowderMembership[]        (CatId, role, status, …)

Cattery (organization / company)
  ├─ members: CatteryMembership[]        (CatId, role, status, …)
  └─ formalClowders: Clowder[]           (derived: where parentCatteryId == this.id)
```

Two illustrative cases:

- **Acme Co. (formal company)**: a Cattery with formal Clowders `Dev
  Team`, `Marketing`, `Ops`. Each Clowder's `parentCatteryId` =
  `acme.id`. Cats are formal members of both the Cattery and the
  Clowders.
- **Cross-Cattery Project Phoenix**: a Clowder with `parentCatteryId =
  null`. Members include `Alice` (formal in Acme), `Bob` (formal in
  Beta), `Carol` (no Cattery). The Clowder is not part of any
  Cattery's org chart.

## Goals

- Treat Cat identity as canonical and never inherited from membership
- Allow Clowders to be either part of a Cattery's org chart or
  freestanding cross-unit task forces
- Make `formal / temp / external` participation status first-class on
  every membership record
- Allow a Cat to participate in multiple Catteries with different
  statuses simultaneously
- Allow a Clowder's members to include Cats not in its parent Cattery
- Provide clear query rules for "the org chart" vs "everyone in this
  cattery" vs "everyone in this clowder"

## Non-Goals

- Permission / ACL model (covered by a future ADR)
- Cross-Cattery visibility / privacy controls (future ADR)
- Federation between Cats Platform instances (out of scope)
- Billing / quota tied to Cattery size (future)
- Migration of any existing data (there is no existing Clowder/Cattery
  data — current code only has empty placeholder UI rows)

## User Stories

- As an Acme owner, I want to see my company's formal org chart with
  departments and the Cats inside each, and have temp contractors not
  clutter the chart.
- As a Project Phoenix lead, I want to assemble a cross-unit task force
  including people from Acme, Beta, and an outside vendor without
  pretending they all belong to one company.
- As a freelancer Cat, I want to be a `formal` member of my own one-Cat
  Cattery and an `external` member of three client Catteries, with each
  context independent.
- As a Clowder lead, I want to add a temp contractor to my task force
  with an automatic expiry rather than having to manually remove them
  later. (Temp status lives at the Clowder level, not the Cattery
  level — see FR-12, 13.)
- As an org chart viewer, I want to filter "show only formal members"
  to see the company's actual reporting structure without temp /
  external noise.

## Requirements

### Functional Requirements

#### Cat

1. A `Cat` has stable identity (`id: CatId`) independent of any
   Clowder/Cattery membership.
2. Removing a Cat from a Clowder or Cattery shall not affect its `Cat`
   record or its participation in other Clowders/Catteries.
3. A Cat's profile fields (`name`, `avatar`, `description`, `defaultExecutionTarget`,
   etc.) are owned by the Cat, not by any Clowder/Cattery the Cat
   participates in.

#### Clowder

4. A `Clowder` has fields:
   - `id: ClowderId`
   - `name: string` (1–80 characters, trimmed)
   - `description: string | null` (up to 500 characters)
   - `parentCatteryId: CatteryId | null`
   - `createdAt`, `updatedAt`

   Members are separate `ClowderMembership` records (§Storage). v1 has
   no avatar: a Clowder shows the first character of its name. There is
   no `createdBy` while the Platform has a single owner.
5. `parentCatteryId === null` means the Clowder is a **cross-unit task
   force** with no formal home in any Cattery's org chart.
6. `parentCatteryId !== null` means the Clowder is a formal unit within
   that Cattery's org chart. It appears under the Cattery's `Clowders`
   tab.
7. A Clowder may have at most one parent Cattery. The parent is chosen
   when the Clowder is created and is cleared only when that Cattery is
   deleted (FR-24); no other change moves a Clowder between Catteries.
   (Reparenting is a future affordance. If needed, model it as
   create-new plus moving the members.)

#### Cattery

8. A `Cattery` has fields:
   - `id: CatteryId`
   - `name: string` (1–80 characters, trimmed)
   - `description: string | null` (up to 500 characters)
   - `domain: string | null` (optional company domain like `acme.com`,
     stored in lower case)
   - `createdAt`, `updatedAt`

   Members are separate `CatteryMembership` records. As for Clowders,
   v1 has no avatar and no `createdBy`.
9. A Cattery's "Clowders" tab lists all Clowders with `parentCatteryId
   === thisCattery.id`. The list is **derived**, not stored on the
   Cattery record.
10. A Cattery's "Cats" tab is an **aggregate** view of every Cat
    reachable from the Cattery, deduped by `catId`. The sources are:
    - direct `CatteryMembership` records (status `formal | external`),
      and
    - members of formal Clowders within the Cattery (any
      `ClowderMembership.status` — `formal | temp | external`).
    The default `statusFilter` is `formal` (the org-chart "正常編制"
    view, which only shows direct formal Cattery members and members of
    formal Clowders whose own Clowder status is `formal`). Switching to
    `all` exposes temp / external participants reached via Clowders. UI
    renders a "via [Clowder]" hint per indirect row and surfaces the
    Clowder-level status chip.

#### Membership Records

11. A `ClowderMembership` record has:
    - `clowderId: ClowderId`
    - `catId: CatId`
    - `role: ClowderRole` — `lead | member` (extensible)
    - `status: MembershipStatus` — `formal | temp | external`
    - `expiresAt: timestamp | null` (only a `temp` membership may carry
      one; nullable so that "indefinite temp" is allowed; leaving `temp`
      clears it)
    - `joinedAt`, `updatedAt: timestamp`

    `addedBy` and `note` are left out of v1: with a single owner every
    change is the owner's, and no surface edits a note yet.
12. A `CatteryMembership` record has:
    - `catteryId: CatteryId`
    - `catId: CatId`
    - `role: CatteryRole` — `owner | admin | member` (extensible)
    - `status: MembershipStatus` — `formal | external` (no `temp` at
      Cattery level — temp is a Clowder-level affordance per the user
      stories; revisit if temp Cattery membership becomes a real case)
    - `joinedAt`, `updatedAt: timestamp`
13. `MembershipStatus = 'formal' | 'temp' | 'external'` is shared between
    Clowder and Cattery membership types, with the constraint above (no
    `temp` at Cattery level in v1).
14. Each `(catId, clowderId)` pair shall have at most one
    `ClowderMembership` record. Same for `(catId, catteryId)` and
    `CatteryMembership`. Status changes update the existing record;
    they do not create a new one. Adding a Cat that is already a member
    changes nothing.

#### Cross-Cattery Participation

15. A Cat shall be allowed to have memberships in multiple Catteries
    simultaneously, with different statuses in each. Each Cattery's
    record is independent of the others.
16. A Clowder's members are NOT constrained by its parent Cattery's
    members. A Cat may be a member of `Clowder X` (in Cattery A) without
    being a member of Cattery A — they appear as a Clowder member only.
    This is the canonical mechanism for "external collaborator on a
    specific project".
17. (Reserved.) The aggregate semantics for the Cattery `Cats` tab —
    including indirect members reached via formal Clowders, the
    "external to this Cattery" chip when no direct membership exists,
    and the per-row Clowder-level status — are defined inline in FR-10.
    This entry is kept as a numbering placeholder so existing references
    do not need to renumber.

#### Queries / Surfaces

18. Endpoints / hooks shall expose at minimum:
    - `getCat(catId)` — Cat profile
    - `listCatsForOwner(ownerId)` — for Lobby's "My Cats" sidebar
    - `getClowder(clowderId)` with members and parent Cattery summary
    - `listClowdersForOwner(ownerId)` — Lobby's "My Clowders" sidebar
    - `getCattery(catteryId)` with members + formal Clowders summary
    - `listCatteriesForOwner(ownerId)` — Lobby's "My Catteries" sidebar
    - `listClowdersByCat(catId)` — for Cat home's "memberships" view
    - `listCatteriesByCat(catId)` — same
    - `listClowdersByCattery(catteryId)` — for Cattery's Clowders tab
    - `listCatsByClowder(clowderId)` — for Clowder's Cats tab
    - `listCatsByCattery(catteryId, { includeIndirect })` — for
      Cattery's Cats tab; `includeIndirect` toggles direct-only vs
      direct + via-formal-Clowders dedup
19. List endpoint `statusFilter` is **entity-specific** because Cattery
    membership has no `temp` status (FR-12, 13):
    - **Clowder list endpoints** (`listCatsByClowder`, `listClowdersByCat`,
      `listClowdersByCattery`) accept:
      - `'all'` (default)
      - `'formal'`
      - `'temp'`
      - `'external'`
      - `'formal_or_temp'` ("people involved in our day-to-day")
    - **Cattery direct-member list endpoints** (`listCatsByCattery`
      with `includeIndirect: false`, `listCatteriesByCat`) accept:
      - `'all'` (default)
      - `'formal'`
      - `'external'`
      - `'temp'` and `'formal_or_temp'` are rejected as invalid input
        (Cattery memberships cannot have `temp` status; the validator
        returns 400)
    - **Cattery aggregate Cats** (`listCatsByCattery` with
      `includeIndirect: true`, FR-10) accepts the full Clowder-side set
      because indirect rows can carry any Clowder status:
      - `'all'`
      - `'formal'` (default for the org-chart view)
      - `'temp'`
      - `'external'`
      - `'formal_or_temp'`
20. The `org-chart` view (Cattery detail Clowders tab; aggregate Cats
    tab) defaults to `statusFilter: 'formal'` to match the user's
    "Cattery 中是正常編制" expectation. The Members tab (direct only)
    also defaults to `'formal'`.

#### Status Transitions

21. Allowed transitions are **entity-specific** because the available
    status set differs (FR-12, 13):
    - **Clowder membership** (`formal | temp | external`):
      - `temp → formal` (promotion)
      - `formal → external` (e.g. employee leaves but stays as
        collaborator)
      - `external → formal` (becomes employee)
      - `temp → external` (sprint contractor becomes ongoing
        collaborator)
      - `formal → temp` (rare but allowed; e.g. converting an employee
        to contractor)
      - `external → temp` (guest becomes a defined-end-date contractor)
    - **Cattery membership** (`formal | external`):
      - `formal → external`
      - `external → formal`
      - Any transition involving `temp` is rejected as invalid input
        because Cattery memberships cannot have that status.
22. Removal is a separate operation from status transition. Removing a
    membership record deletes the row; it does not change status.
23. `expiresAt` (only meaningful for `status === 'temp'`): v1 never
    hides or removes a membership on its own. A temp member whose end
    date has passed stays listed and shows the date as passed; the owner
    removes it. A "Past members" view is a follow-up.

#### Deleting and Moving (accepted 2026-11-16)

24. A group never owns a Cat, and no Cat or Clowder has to belong to a
    group:
    - Deleting a Clowder ends its memberships. Its Cats stay.
    - Deleting a Cattery ends its direct memberships. Its Clowders stay
      with all their members and no longer belong to a Cattery
      (`parentCatteryId` becomes `null`). Its Cats stay.
    - Deleting a Cat ends every membership it has. Archiving a Cat keeps
      them.
    - Clowders and Catteries have no archive state in v1; delete is the
      only removal, behind a confirmation that says what stays.
25. Moving a Cat from one Clowder to another is one operation: it
    leaves the source and joins the target as a `member`, keeping its
    status and end date. If it is already in the target, it only leaves
    the source. "Also add" is FR-14's add and keeps the source.

### Non-Functional Requirements

- **Identity stability**: deleting / renaming a Cattery shall not
  invalidate Cat IDs or Clowder IDs.
- **Referential integrity**: `parentCatteryId`, `clowderId` and
  `catteryId` references always resolve inside the directory file, and
  a file where one does not is refused unchanged. A Cattery's delete
  clears its Clowders' `parentCatteryId` (FR-24). A new membership must
  name an existing Cat; Cat deletion ends the Cat's memberships, and a
  list skips any membership whose Cat no longer exists.
- **Auditability**: deferred. v1 records `joinedAt` and `updatedAt` on
  each membership but writes no audit record. Every change is the single
  owner's; an audit trail returns with multi-user Catteries.
- **Naming clarity**: the platform contract terminology must use
  `clowder` / `cattery` consistently — never `team` / `org` / `group`
  in shared types unless the field name is product-specific copy.

## Storage / Contract Notes

- Storage layer (decided 2026-11-16): a Platform-owned file beside the
  chat state, `<state name>.directory.json` (for the default profile,
  `chat-state.local.directory.json`), with its own `schemaVersion`
  (1). Not Core state: the database profile envelope requires every
  Core collection, so new collections would need a profile version
  upgrade, and an older build would otherwise drop data it does not
  know. An older build never opens this file. The rules:
  - A missing file is an empty directory. A file that is not valid
    JSON, has a broken reference, or has a newer `schemaVersion` is
    refused and left unchanged; nothing is written over it.
  - Writes run one at a time in the process and replace the file
    atomically. Every read goes to disk, so nothing is cached across a
    Platform data reset, which removes the file.
  - Like the memory and companion-box files, it is not part of the
    conversation database's snapshots, restore or export.
- Membership normalization: prefer storing memberships as separate
  records (`ClowderMembership[]` table) keyed by `(clowderId, catId)`
  rather than as an embedded array on the Clowder. Same for Cattery.
  Rationale: a Cat's "all my memberships" query is common (Cat home
  Memberships tab), and embedded arrays force whole-record reads.
- IDs: opaque strings. Avoid embedding human-readable hints in IDs to
  keep them stable across renames.

## Surface Implications (links into SPEC-102)

### Lobby sidebar (already in SPEC-102)

- `My Cats` — `listCatsForOwner(me)`
- `My Clowders` — `listClowdersForOwner(me)`
- `My Catteries` — `listCatteriesForOwner(me)`

### Cat detail (`/cats/:catId`)

- Default lens: `Overview`. New section needed: `Memberships` listing
  Clowders and Catteries this Cat is in, with each row's
  `role` + `status` chip.
- The `Overview / Chat / Work / Code` lens model from SPEC-064 is
  unchanged.

### Clowder detail (`/clowders/:clowderId`)

- Tabs (locked, per SPEC-102 FR-11): `Cats / Settings`. Default = `Cats`.
  A Clowder is a flat task force; it does not separate "humans who run
  it" from "cats inside" the way a Cattery does, so collapsing to one
  member-bearing tab is correct.
- `Cats` tab: full member list (`listCatsByClowder`) with `status` chips
  (`formal | temp | external`). Default `statusFilter: 'all'` because a
  task force usually wants to see every active participant.
- Header should show:
  - if `parentCatteryId !== null` — chip "Part of [Cattery name]"
    linking to the Cattery
  - if `parentCatteryId === null` — chip "Cross-unit task force"

### Cattery detail (`/catteries/:catteryId`)

- Tabs (per SPEC-102 FR-12): `Members / Clowders / Cats / Settings`
  - `Members`: direct Cattery members (`CatteryMembership` records).
    Default `statusFilter: 'formal'`; user can switch to `all` or
    `external`.
  - `Clowders`: derived `listClowdersByCattery`. Default filter shows
    formal Clowders (the org chart). A separate filter exposes "all
    Clowders that include any of our members" if needed (future).
  - `Cats`: aggregate via `listCatsByCattery({ includeIndirect: true
    })`. Each row shows where the Cat is reached from (direct vs via
    Clowder Y).
  - `Settings`: cattery profile fields, transfer ownership, archive.

### Mobile (Cats tab)

- The Cats tab lists Clowders and Catteries with their Cat counts.
  Tapping one opens its home on the Cats tab's own stack
  (`cats/clowder/:id`, `cats/cattery/:id`), so back returns to the
  directory.
- A Clowder home shows its Cattery ("Part of …", which opens it) or
  "Cross-unit task force", its description and its members, each with
  role and any non-formal status (a passed end date shown, FR-23).
- A Cattery home shows its domain, description, direct members and its
  Clowders with their Cat counts.
- Wording comes from the Desktop catalogs, and the end-date and FR-16
  rules from `src/shared/directoryMembership.ts`, which both clients
  read.
- Mobile reads `/api/platform/directory` with its bearer session and
  reads it again when the screen regains focus.

## Boundaries

### What this SPEC defines

- The data model: entities, membership records, status semantics
- Query / list shape requirements
- Status transition rules
- Surface implications for each entity's detail page

### What this SPEC does not define

- Permission/ACL model — who can edit, who can invite, who can promote
- API endpoint shapes (REST/RPC) — covered by Core contract follow-up
- UI primitives for membership management (invite flow, role picker,
  status chip styles) — covered by a follow-up UI SPEC
- Migration: there is no existing Clowder/Cattery data to migrate

## Open Questions

- [ ] Cattery-level temp membership: the current decision is no
      `temp` status at Cattery level. If "30-day evaluation employee"
      becomes a real case, revisit.
- [x] Cattery archive vs delete semantics: v1 has delete only, and it
      never removes a Cat or another group's data (FR-24).
- [ ] Clowder reparenting (changing `parentCatteryId` to another
      Cattery): out of scope in v1 (FR-7). If future need, model as
      create-new + moving the members.
- [ ] Should `Cat` carry a "primary Cattery" affinity field (similar to
      a primary email)? Helpful for default routing / billing context.
      Tentative: no — defer until a concrete need.
- [ ] Identity provider integration: when a Cat is bound to a Google /
      Telegram identity (per SPEC-100), does that influence Cattery
      eligibility? E.g. domain-matched auto-add? Out of scope; future
      ADR.

## Dependencies

- [ADR-100](../decisions/100-cats-as-canonical-identity-with-clowder-and-cattery-as-associations.md)
- [ADR-099](../decisions/099-promote-cats-clowders-catteries-to-platform-entities.md)
- [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [SPEC-102](./SPEC-102-lobby-sidebar-ia-and-entity-routes.md)
- [SPEC-064](./SPEC-064-my-cats-platform-home-and-lens-projections.md)

## References

- The user-given conceptual model (chat, 2026-05-05): "Cattery 中會是
  正常編制, Clowder 可以是裡面的一個編制, 也可以是沒記錄在 Cattery
  組織架構中的(跨單位)task force, 甚至包含外人; 相同的, Clowder 的
  group 可以包含非正式的 cats, 例如 temp participant 就是很好的例子."

---

*Created: 2026-05-05*
*Author: Claude*
*Related Plan: [PLAN-091](../plans/PLAN-091-lobby-sidebar-and-entity-routes-rollout.md) Phase 6 (gated on this SPEC)*
