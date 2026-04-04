# Cats Chat Spatial Layout Guidelines

## Metadata

- **Date**: 2026-03-26
- **Author**: Codex
- **Scope**: `Cats Chat` product layout, secondary surfaces, split artifact
  behavior, and companion-aware workspace structure
- **Related**:
  - [Cats Product Lines: Chat, Work, and Code](./2026-03-20-cats-product-lines-chat-work-code.md)
  - [Structured Choices Design Reference](./2026-03-24-structured-choices-design-reference.md)
  - [Unified Planning Language and Cross-Product Strategy](./2026-03-26-unified-planning-language-and-cross-product-strategy.md)

## Purpose

Capture the intended spatial model for `Cats Chat` before more UI work lands.

This note is not an ADR or a pixel-perfect spec. It is a product-layout
guideline for deciding where transcript, artifact, compose configuration,
operator state, and companion-specific surfaces should live.

## Core Principles

### 1. The chat canvas is sacred

The main canvas should prioritize:

- transcript
- composer
- optional focused artifact view

It should not be permanently occupied by orchestration telemetry, status cards,
or deep configuration panels.

### 2. Secondary surfaces must be intentional

`compose-config`, `cwd browser`, and `operator` are all secondary surfaces.
They should not each invent their own spatial model.

The product should converge on one secondary-surface framework, with clearly
defined modes, anchors, and fallback behavior.

### 3. Split canvas changes ownership

When artifact split view is active, the workspace is no longer a single pane.
At that point, transcript-side controls and artifact-side controls should not
pretend to belong to the same visual strip.

### 4. Operator state is important, but not always-on

Approvals, run status, activity, and inspector details matter, but they are not
the main content of a chat room. They should be on-demand surfaces, with
lightweight indicators when attention is needed.

## Primary Workspace Model

### Default chat mode

The default `Cats Chat` workspace is:

- transcript
- composer
- optional lightweight status indicators

No always-visible operator cards should sit beside the transcript in normal
use.

### Split artifact mode

When an artifact becomes the active focus, `Cats Chat` should promote into a
split workspace:

- left pane: transcript + composer
- right pane: artifact viewer/editor/preview

This split should be treated as two panes within one room, not as one canvas
with a random extra box attached.

## Action Bars

### Default mode

In the non-split layout, a single transcript-oriented header/action area is
acceptable.

### Split artifact mode

In split mode, use **pane-local action bars**:

- transcript pane gets its own header/action bar
- artifact pane gets its own header/action bar

This is preferable to one cross-pane header because:

- ownership is clearer
- transcript actions stay with transcript
- artifact actions stay with artifact
- the room does not feel like two unrelated spaces glued together

### Transcript-pane actions

Transcript-pane actions are room/chat-centric:

- compose-config entry
- operator indicator
- room status / mode indicators
- companion-specific quick toggles when applicable

### Artifact-pane actions

Artifact-pane actions are object-centric:

- preview/open mode
- refresh/reload
- open externally
- compare/copy/export
- other artifact-local controls

## Secondary Surface Framework

`Cats Chat` should use one shared secondary-surface framework, not multiple
unrelated panels and dialogs.

The important distinction is not "one giant tabbed panel" versus "many random
panels". The correct model is:

- one shared framework
- multiple explicit modes
- one active mode at a time

### Recommended modes

- `compose-config`
- `cwd-browser`
- `operator`

### What belongs in `compose-config`

`compose-config` is the transcript-side configuration surface for the current
room/draft. It should include:

- `Model`
- `Cats`
- `Working Directory`

These can be organized with internal accordion sections.

`upload file` should remain separate. It is an attachment ingress action, not a
configuration section.

### What belongs in `operator`

`operator` is the run/automation inspection surface. It can include sections
for:

- `Approval`
- `Progress`
- `Activity`
- `Run Inspector`

These can also use collapsible sections, but `operator` should remain a
distinct mode from `compose-config`.

### Why not keep operator cards on the canvas

The previous always-visible four-card rail creates several problems:

- it competes with transcript as the primary visual focus
- it feels heavy even in cat-led rooms
- it is confusing in solo/direct chat
- it scales poorly once artifact split view exists

The preferred model is:

- lightweight indicator in the transcript-pane header
- badge/toast only when attention is needed
- full detail only when the user explicitly opens `operator`

## Drawer, Dialog, and Width Rules

### Preferred surface type

The preferred secondary-surface form factor is a drawer/sheet, not a tiny
popover.

Reason:

- `compose-config` already contains enough content to exceed popover comfort
- `cwd browser` is too content-heavy for the current small dialog shape
- `operator` includes inspection data that benefits from a stable side surface

### Anchoring rule

When the workspace is not split, a right-side drawer is fine.

When artifact split view is active, the secondary surface should become
**pane-scoped**:

- transcript-side surfaces open from the transcript pane edge
- artifact-side surfaces, if introduced later, open from the artifact pane edge

This avoids the awkward spatial model where a transcript control opens across
the artifact pane from the far edge of the app.

### Fallback rule

If the active pane is too narrow to host a usable drawer:

- fall back to a larger modal or full-screen sheet

The fallback should depend on available width, not on arbitrary feature type.

## Compose Config Guidance

`compose-config` should remain a combined surface. It should not split provider,
model, cat selection, and working-directory setup into unrelated popups.

Recommended internal structure:

- `Model`
- `Cats`
- `Working Directory`

This gives one coherent answer to the question:

> How is this room configured right now?

## Working Directory Guidance

The current dedicated `cwd selector` dialog already shows the limits of the
small centered-dialog approach. Long path trees and narrow viewports cause the
surface to "hit the wall" quickly.

Direction:

- converge `cwd selector` into the same secondary-surface framework
- allow it to use a wider drawer or sheet than normal compose config
- avoid small modal sizing as the long-term default

## Companion Extension

Direct companion chat introduces a larger right-side need than ordinary chat.

That space should not be modeled as "artifact only". Instead, companion mode
needs a broader **companion dashboard** concept.

Recommended sections:

- `Overview`
- `Resources`
- `Creations`
- `Settings`

Artifact view should be treated as a **focused object mode** within companion
space, not as the only right-pane purpose.

## Companion Quick Controls

Companion-specific high-frequency controls should live in the transcript-pane
header/action area, not buried in deep settings.

Current candidates:

- `Human-like` vs `Cat-like` behavior toggle
- `Awake` vs `Sleeping` toggle

`Disturb` does not need to be a separate toggle. If the companion is sleeping
and the user switches it to awake, that action is already the disturbance.

## Task Surfaces in Cats Chat

`Cats Chat` should not be fully task-blind. A bounded amount of
cross-thread/cross-room orchestration is appropriate for Chat, especially when
`Boss Cat` needs to spin up a small number of supporting threads or delegated
subtasks.

However, that does not mean Chat should inherit the full visual weight of a
`Cats Work` task board.

### Recommended three-layer task model

#### 1. Thread-scoped task slice

Every thread should have a stable `Tasks` entry in the transcript-pane header.

That entry opens a transcript-scoped task slice for:

- tasks created in this thread
- tasks linked to this thread
- thread-local blockers, approvals, and recent completions
- linked cross-product tasks when this thread hands work off to Work or Code

This should be the normal day-to-day task view inside Chat.

#### 2. Chat-wide lightweight dashboard

If Chat allows `Boss Cat` to open supporting threads or do bounded
cross-thread work, Chat also needs a lightweight dashboard above the
thread-scoped slice.

This dashboard should answer:

- which chat threads currently have active work
- which chat tasks are blocked
- which tasks are waiting for approval
- which supporting threads were opened by `Boss Cat`
- which task results are ready to be folded back into the main thread

This is the minimal operator view needed to keep bounded Chat orchestration
legible.

#### 3. Platform-wide global task dashboard

The platform should also have a higher-level task dashboard for:

- all Chat tasks
- all Work tasks
- all Code tasks
- cross-product filtering and operator-level inspection

This is not a Chat-local surface. It is the platform-wide control plane.

### Why Chat still needs its own dashboard

Thread-scoped tasks alone are not enough once Chat allows bounded
cross-thread orchestration. Without a Chat-wide view, the user loses sight of:

- which supporting threads were opened
- whether those threads are still running
- whether any subtask is blocked or waiting
- whether `Boss Cat` has spread activity across several rooms

So the correct model is:

- thread-local task slice for local context
- Chat-wide lightweight dashboard for Chat-level orchestration awareness
- platform-wide global dashboard for full multi-product oversight

### Scope guard

`Cats Chat` should allow bounded orchestration, not a full Work-style
multi-team task board. If Chat opens too many hidden threads or parallel lanes
without a corresponding Chat-wide dashboard and visibility rules, the product
will feel opaque and untrustworthy.

## Recommended Default Behavior

### Solo/direct chat

- no always-on operator cards
- no forced artifact split
- transcript remains the main surface
- operator only appears on demand

### Cat-led room

- same spatial model as solo/direct chat
- cat-led orchestration does not justify permanent operator clutter
- blocking events may show indicator badges or notifications
- thread-local tasks remain available, while broader Chat work should surface
  through a lightweight Chat-wide dashboard rather than permanent canvas cards

### Artifact-focused session

- split workspace
- pane-local action bars
- transcript-side secondary surfaces stay transcript-scoped

### Companion-focused session

- transcript remains primary
- right-side space may promote into companion dashboard
- focused artifact viewing is only one of several companion dashboard modes

## Recommendation Summary

1. Remove always-visible operator cards from the main canvas.
2. Use transcript-pane indicators plus on-demand operator mode.
3. Keep `compose-config` as one coherent secondary surface.
4. Converge `cwd selector` into the same framework rather than keeping a small
   cramped dialog.
5. In split artifact mode, use pane-local action bars.
6. In split artifact mode, make transcript-side drawers pane-scoped.
7. Treat companion right-side space as a dashboard/workspace, not merely an
   artifact viewer.
8. Give Chat both thread-scoped task slices and a lightweight Chat-wide
   dashboard once bounded cross-thread orchestration is allowed.

---

*Research note completed: 2026-03-26*
*Author: Codex*
