# ADR-131: Let the Audience Chip Choose the Audience and the Avatar Choose the Model

## Status

Accepted, 2026-10-20. Two weeks after #253 and #255 (Desktop 0.7.12 and 0.7.13)
moved model picking from the side panels into the composer chip's popover, the
owner asked to take the model rows back out of the chip and to make participant
avatars the place where a participant is changed. This amends the
[composer popover hosts](../specs/SPEC-013-provider-catalog-consumption-and-ui-seam.md#composer-popover-hosts-2026-10-06)
in SPEC-013.

## Context

- #253 opened a popover from the composer's audience chip. For a single target it
  showed the provider/model picker; in a group, each audience row showed the
  participant's model and a `>` button that drilled into that participant's
  picker in the same popover. The side panels lost their execution section.
- The owner's model of the composer:
  - The audience chip chooses who hears the next message and in what order.
  - A participant's own settings belong to that participant's avatar.
  - Every conversation has at least one participant, God Cat included, and so
    at least one avatar. With exactly one participant the audience cannot change
    and the order cannot move, so the UI hides that lone avatar and lets the chip
    stand in for it, opening what the avatar would open.
- The side panel's participants section hosted adding cats and assistant
  presets, the temporary-participant form with its role hint, and renaming. The
  owner wanted that section gone, with the composer carrying every participant
  action.

## Decision

1. **Chip.** Audience rows show the participant only: drag handle, avatar, name
   and checkbox, with the workflow toggle on the chip. A row's model is a tooltip
   read from the target its avatar edits. When the participant set has one
   member, the chip opens that participant's popover, as #253 already did.
2. **Avatar.** Clicking a participant's avatar opens a popover with that
   participant's picker, the conversation action (start fresh) and the cat
   settings link. It edits the target the send path uses
   (`resolveDraftTargetEditor`, `resolveConversationTargetEditor`):
   - in a draft, the avatars in the composer roster, opening above it;
   - in a started conversation, the avatars in the header roster, opening below
     it. The owner chose the header over a second roster in the composer, which
     would show the same avatars twice.

   A header avatar whose saved choice is no longer offered keeps SPEC-013's
   behavior: its attention mark covers the avatar and opens the cat's model
   field in Settings instead.
3. **Visibility is unchanged.** When the roster, buttons, hints and their accent
   or danger tones appear stays as it was, under the advanced draft controls
   setting too. `tests/draft-composer-visibility-matrix.test.tsx` locks it.
   The roster hiding and the chip opening a picker are separate conditions: in a
   parallel draft the lead roster lists the lead lane's members while its chip
   picks from the shared pool, so a one-member lead lane hides its roster and
   still chooses an audience.
4. **`+` only adds, `×` only removes.**
   - In a draft, the add button opens a menu of a temporary participant,
     existing cats and existing assistant presets, where the side panel used to
     add them: a group draft (cats and assistants) or the shared pool of a
     parallel draft whose lead lane already has members (cats). A lead lane
     without its own members reads the draft audience, so a cat added there
     would join every such lane; that draft keeps the one-click action. Added cats and assistants are disabled; an assistant awaiting
     an activation review stays disabled. A full conversation disables both.
   - The add button keeps its one-click action when no cat or assistant could
     join, and on a new chat that it seeds into a group. When the button, its
     hint and their tones appear is unchanged.
   - In a started conversation, a header add button opens the existing add-cat
     panel where the side panel's "Choose cats" did.
   - Removing stays on each avatar's `×`.
5. **A temporary participant's popover also edits its name and role hint.** A
   field saves when it is left, on Enter, or when the popover closes; Escape
   discards the field being typed. A name is never saved empty. A cat is renamed on its own page.
6. **A participant added from an assistant preset is read-only in a draft**: its
   popover shows the model and role hint without fields. The create contract
   (`CreateTemporaryParticipantInput`) carries no `presetId`, so once the
   conversation exists it is an ordinary temporary participant. Keeping it
   read-only there would change the frozen Chat API contract and waits for the
   owner's decision on assistant presets.
7. **The side panel's participants section is gone**, in drafts and in
   started conversations, with the temporary-participant form, its rename
   state and the side panel's cat row. The side panel keeps its folder and run
   status sections (and Code's session profile); nothing opens it on a
   participant any more. The quick add names a new temporary participant
   automatically, and its role hint is set in its avatar popover.

## Consequences

### Positive

- Choosing an audience can no longer change a model by accident, and each
  participant has one place to change.
- A started conversation can change any participant's model from the header,
  including a conversation of temporary participants only. Its chip chooses
  the audience among them like any other room's: the renderer counts only cats
  when it classifies a default chat, while the send path counts every
  participant, so the chip follows the participants rather than that mode.
- A draft cat's avatar tooltip now shows the draft's pick for that cat rather
  than the cat's default.

### Negative

- Model changes move again, two weeks after #253; the release notes of the
  version that ships this must say so.
- In a started one-to-one conversation the header avatar and the chip open the
  same popover.

### Neutral

- The chip, the roster and the header share one popover component
  (`ParticipantTargetPopover`) and one dismissal hook.

## Alternatives Considered

### Alternative 1: Keep the drill-in rows in the chip

- **Pros**: Already shipped; one floating layer for audience and model.
- **Cons**: Mixes choosing an audience with editing participants.
- **Why rejected**: The owner's model gives the chip the audience only.

### Alternative 2: A composer roster in started conversations too

- **Pros**: The same place as in a draft.
- **Cons**: The header already shows the same avatars with their status marks.
- **Why rejected**: The owner chose the header.

### Alternative 3: Move the header roster into the composer

- **Pros**: One roster, in the composer.
- **Cons**: The header's lead badge, live pulse and attention marks would have to
  move as well, a larger change.
- **Why rejected**: Not needed to give each participant one place to change.
