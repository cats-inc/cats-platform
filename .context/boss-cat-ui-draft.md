# Boss Cat UI Draft

> Working draft only.
> This is not a formal spec, ADR, or implementation plan.
> Expect the wording and layout to change after UI review.

## Intent

Record the current naming and rough UI direction for the visible default public
orchestrator identity without freezing it as a formal product contract.

## Current Naming Direction

- Formal/domain term: `Primary Orchestrator Cat`
- User-facing UI term: `Boss Cat`
- Rejected alternative: `Cat Boss`

## Draft UI Copy

- Section title: `Boss Cat`
- Empty state: `No Boss Cat selected`
- Current selection label: `Current Boss Cat`
- Button: `Set as Boss Cat`
- Button: `Replace Boss Cat`
- Button: `Create and Set as Boss Cat`
- Status label: `Boss Cat status`
- Status value: `Active`
- Status value: `Warming`
- Status value: `Offline`

## Draft Supporting Copy

- Helper text:
  `Your Boss Cat is the default public orchestrator for new chats and future bot channels.`
- Empty-state helper:
  `Choose a cat to act as your default public orchestrator.`

## Draft UI Direction

- `Settings > Cats` should include a `Boss Cat` section.
- `+ New Chat` should start as a conversation with the selected Boss Cat.
- The Boss Cat is the visible chat identity.
- Orchestration traces, dispatch details, and similar system activity should
  stay outside the main transcript by default.

## Explicit Non-Commitments

- This note does not freeze layout.
- This note does not freeze final wording.
- This note does not define the final data model.
- This note does not approve implementation yet.

---

*Last updated: 2026-03-19*
