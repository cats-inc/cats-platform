# PLAN-007: Chat-Contextual Cat Entry

Status: Draft (Pending Review)

## Scope

Translate the cat information-architecture decision into an implementation path
that keeps the shared cat registry intact while moving the primary operator
entry back into the active chat.

## Phases

### Phase 1: Information Architecture

- [ ] Remove `Cats` from first-level workspace navigation.
- [ ] Introduce a `Settings` destination reached from the left-panel account
      menu.
- [ ] Define `Settings > Cats` as the reusable cat registry surface.
- [ ] Define the selected-chat `Add cat` entry point location.

**Deliverables**: approved navigation map and surface ownership.

### Phase 2: Contextual Add Cat Flow

- [ ] Add a chat-contextual side sheet or modal for `Add cat`.
- [ ] Make `Choose existing` the default path.
- [ ] Support assigning an existing workspace cat to the current chat.
- [ ] Keep roster feedback visible after assignment.

**Deliverables**: current-chat add/assign flow.

### Phase 3: Contextual Create New Flow

- [ ] Support `Create new` inside the contextual Add cat surface.
- [ ] Keep the default creation path lightweight.
- [ ] Collapse advanced settings behind a secondary section.
- [ ] Compose existing APIs so creation also results in current-chat assignment.

**Deliverables**: create-and-assign path from chat context.

### Phase 4: Settings-Hosted Registry

- [ ] Add a settings shell with `Cats` as one section.
- [ ] Keep direct `Create new` available there.
- [ ] Keep room for edit, archive, and inspect actions even if not all ship in
      the first slice.
- [ ] Preserve registry-wide visibility without making it the primary workflow.

**Deliverables**: management-oriented registry surface.

### Phase 5: Validation and Cleanup

- [ ] Update renderer copy so "cat registry" and "add cat to this chat" are not
      conflated.
- [ ] Add tests for the new navigation and contextual create/assign sequence.
- [ ] Ensure the shared data model remains workspace registry plus channel
      assignment.

**Deliverables**: aligned copy, tests, and stable semantics.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/renderer/App.tsx` | Refactor | Move `Cats` out of primary nav and introduce settings plus contextual Add cat flows |
| `src/renderer/styles.css` | Modify | Support account menu, settings shell, and contextual Add cat panel |
| `src/renderer/api.ts` | Reuse / extend | Compose global cat creation and channel assignment flows |
| `src/shared/app-shell.ts` | Review | Confirm the existing payload is sufficient for contextual Add cat UI |
| `tests/` | Expand | Add coverage for the new IA and creation/assignment behavior |
| `docs/` | Update | Keep IA, requirements, and roadmap consistent |

## Validation

- Operators can add an existing cat from inside the active chat without first
  opening a registry page.
- Operators can create a new cat from the active chat and see it assigned
  immediately afterward.
- Operators can still manage the registry from `Settings > Cats`.
- No planning document implies that reusable cat management must stay in
  first-level navigation.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Settings shell grows before other settings exist | Medium | Keep the first settings scope minimal and explicitly anchored around Cats |
| Contextual Add cat flow becomes too heavy | High | Default to choose-existing and keep advanced fields collapsed |
| Team members interpret the change as a schema rewrite | Medium | Repeatedly anchor the plan to ADR-005 and the existing registry-plus-assignment model |
| Chat UI becomes cluttered | Medium | Use one clear contextual entry instead of adding multiple buttons around the composer |

---

*Last updated: 2026-03-17*

