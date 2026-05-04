# SPEC-103: Clowder and Cattery Data Model and Membership Semantics

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
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
- As a Cattery admin, I want adding a temp contractor to expire
  automatically rather than requiring a manual "remove" later.
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
   - `name: string`
   - `avatar: AvatarRef | null`
   - `description: string | null`
   - `parentCatteryId: CatteryId | null`
   - `members: ClowderMembership[]` (or kept normalized — see §Storage)
   - `createdAt`, `createdBy`, `updatedAt`
5. `parentCatteryId === null` means the Clowder is a **cross-unit task
   force** with no formal home in any Cattery's org chart.
6. `parentCatteryId !== null` means the Clowder is a formal unit within
   that Cattery's org chart. It appears under the Cattery's `Clowders`
   tab.
7. A Clowder may have at most one parent Cattery; the parent is
   immutable after creation. (Reparenting is a future affordance — out
   of scope here. If needed, model as create-new + transfer-members.)

#### Cattery

8. A `Cattery` has fields:
   - `id: CatteryId`
   - `name: string`
   - `avatar: AvatarRef | null`
   - `description: string | null`
   - `domain: string | null` (optional company domain like `acme.com`)
   - `members: CatteryMembership[]`
   - `createdAt`, `createdBy`, `updatedAt`
9. A Cattery's "Clowders" tab lists all Clowders with `parentCatteryId
   === thisCattery.id`. The list is **derived**, not stored on the
   Cattery record.
10. A Cattery's "Cats" tab lists all Cats with formal participation in
    the Cattery — both direct (Cattery.members) and indirect (members of
    formal Clowders), deduped by `catId`. UI may render a "via
    [Clowder]" hint per row.

#### Membership Records

11. A `ClowderMembership` record has:
    - `clowderId: ClowderId`
    - `catId: CatId`
    - `role: ClowderRole` — `lead | member` (extensible)
    - `status: MembershipStatus` — `formal | temp | external`
    - `joinedAt: timestamp`
    - `addedBy: CatId`
    - `expiresAt: timestamp | null` (only meaningful when `status ===
      'temp'`; nullable so that "indefinite temp" is allowed)
    - `note: string | null`
12. A `CatteryMembership` record has:
    - `catteryId: CatteryId`
    - `catId: CatId`
    - `role: CatteryRole` — `owner | admin | member` (extensible)
    - `status: MembershipStatus` — `formal | external` (no `temp` at
      Cattery level — temp is a Clowder-level affordance per the user
      stories; revisit if temp Cattery membership becomes a real case)
    - `joinedAt: timestamp`
    - `addedBy: CatId`
    - `note: string | null`
13. `MembershipStatus = 'formal' | 'temp' | 'external'` is shared between
    Clowder and Cattery membership types, with the constraint above (no
    `temp` at Cattery level in v1).
14. Each `(catId, clowderId)` pair shall have at most one
    `ClowderMembership` record. Same for `(catId, catteryId)` and
    `CatteryMembership`. Status changes update the existing record;
    they do not create a new one.

#### Cross-Cattery Participation

15. A Cat shall be allowed to have memberships in multiple Catteries
    simultaneously, with different statuses in each. Each Cattery's
    record is independent of the others.
16. A Clowder's members are NOT constrained by its parent Cattery's
    members. A Cat may be a member of `Clowder X` (in Cattery A) without
    being a member of Cattery A — they appear as a Clowder member only.
    This is the canonical mechanism for "external collaborator on a
    specific project".
17. The Cattery's "Cats" tab (FR 10) lists Cats reached via formal
    Clowders even if they are not direct Cattery members. UI labels the
    row with their Clowder-level status (`temp` / `external`) and may
    surface a chip "external to this Cattery" when the Cat has no direct
    Cattery membership.

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
19. Each list endpoint shall accept a `statusFilter` parameter:
    - `'all'` (default)
    - `'formal'`
    - `'temp'`
    - `'external'`
    - `'formal_or_temp'` (for "people involved in our day-to-day")
20. The `org chart` view (Cattery detail "Clowders" + "Cats" tab) shall
    default to `statusFilter: 'formal'` to match the user's stated
    "Cattery 中是正常編制" expectation.

#### Status Transitions

21. Allowed transitions for `MembershipStatus`:
    - `temp → formal` (promotion)
    - `formal → external` (e.g. employee leaves but stays as
      collaborator)
    - `external → formal` (becomes employee)
    - `temp → external` (sprint contractor becomes ongoing collaborator)
    - `formal → temp` (rare but allowed; e.g. converting an employee to
      contractor)
22. Removal is a separate operation from status transition. Removing a
    membership record deletes the row; it does not change status.
23. `expiresAt` (only meaningful for `status === 'temp'`):
    - When the timestamp passes, the membership shall be hidden from
      default views but not auto-deleted (data is retained for audit;
      explicit removal is a separate action).
    - Expired-temp Cats are listed under "Past members" or an explicit
      filter, not in the active member list.

### Non-Functional Requirements

- **Identity stability**: deleting / renaming a Cattery shall not
  invalidate Cat IDs or Clowder IDs.
- **Referential integrity**: `parentCatteryId` and all `catId` /
  `clowderId` / `catteryId` foreign references shall be enforced. A
  Clowder pointing at a deleted Cattery is invalid; the Cattery's
  delete must reparent or remove its Clowders explicitly (out of scope
  for v1, but the constraint must be in the schema).
- **Auditability**: every membership change (add, status change,
  remove) shall produce an audit record sufficient to answer "who added
  Bob to Acme as external on what date?". Reuse existing Activity
  record family if appropriate; otherwise add Membership-specific audit.
- **Naming clarity**: the platform contract terminology must use
  `clowder` / `cattery` consistently — never `team` / `org` / `group`
  in shared types unless the field name is product-specific copy.

## Storage / Contract Notes

- Storage layer: TBD (Core records vs. dedicated tables). Out of scope
  for this SPEC; covered by Core platform contract follow-up.
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

- Tabs (per SPEC-102 FR-11): `Members / Cats / Settings`
  - `Members`: humans/owners — Cats with `role ∈ {lead, member}` and
    explicit "people who run this Clowder" semantics. (The Clowder
    itself doesn't separate "members" from "cats" the way a Cattery
    does; consider collapsing to one tab.) — **Open question**.
- Header should show:
  - if `parentCatteryId !== null` — chip "Part of [Cattery name]"
    linking to the Cattery
  - if `parentCatteryId === null` — chip "Cross-unit task force"
- Tab `Cats`: full member list with `status` chips (formal/temp/
  external).

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

- [ ] Clowder detail `Members` vs `Cats` tabs (FR-11 in SPEC-102):
      should they be separate, or collapsed into one tab? A Clowder
      arguably has only "Cats" (no separation between "humans who run
      it" and "cats inside"). **Tentative**: collapse to `Cats /
      Settings`.
- [ ] Cattery-level temp membership: the current decision is no
      `temp` status at Cattery level. If "30-day evaluation employee"
      becomes a real case, revisit.
- [ ] Cattery archive vs delete semantics: archive preserves data
      (read-only); delete is permanent. Both possible, both need
      careful handling — out of scope for v1, raise when needed.
- [ ] Clowder reparenting (changing `parentCatteryId`): explicitly out
      of scope in v1. If future need, model as create-new + member
      transfer rather than mutating the field.
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
