# ADR-129: Keep Direct Messages in Chat and Share One Conversation Draft

## Status

Accepted, 2026-10-03. While planning to unify the Code and Work direct-message
drafts with Chat's, the owner asked why Code and Work had a direct-message entry
at all, since direct messages are a Chat concept and other surfaces already
deep-link to Chat. The owner chose to retire the Code and Work direct-message
route instead of unifying its draft, and to name the one remaining shared draft
after the cross-product `Conversation` term. This supersedes
[ADR-067](067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md)
and replaces the renderer-ownership split in
[SPEC-068](../specs/SPEC-068-new-code-draft-canvas-and-renderer-ownership.md).

## Context

- Code and Work renderers were forked from Chat on 2026-03-28 (`53e6c70b`). They
  inherited the My Cats sidebar section and the `/{prefix}/my-cats/:catId` route,
  which PLAN-091 later renamed to `/{prefix}/dm/:catId` (`e3575a12`).
- On 2026-05-05 `dce12c7b` made the Direct Messages sidebar section opt-in because
  it was leaking into the Code and Work sidebars; only Chat shows it. The
  `dm/:catId` route in the shared `WorkspaceAppRoutes` stayed.
- The only UI entry left was the Work War Room "Open {actorName}" button on task
  cards and details (`22589eeb`, `04f6e3bc`, 2026-04-15). Code had none; a typed
  URL was the only way in.
- That route rendered the legacy shared draft `NewChatDraft.tsx`
  (`WorkspaceNewChatDraft`): a profile header without a cover and the overlapping
  `ComposerCatStack`. Chat's direct-message draft and every other Code and Work
  draft render through `ChatNewChatDraft`, with the `AudienceChip` that replaced
  the stack in `836db5a4`. An attempt to move everything onto `ChatNewChatDraft`
  (`3b971d08`, 2026-04-21) was reverted for direct lanes only (`53cc7aae`), so
  every draft layout change since then has had to land in both components.
- The Code and Work draft wrappers treated any default recipient as a direct
  lane, so `/code/new?cat=<id>` and `/work/new?cat=<id>` also reached the legacy
  draft. Chat treats the same URL as an ordinary draft with that Cat preselected.
- [docs/terminology.md](../terminology.md) makes `Conversation` the canonical
  cross-product term for the durable interaction unit and reserves `Chat` for the
  Cats Chat product.

## Decision

1. **Direct messages are Chat-owned.** Code and Work do not render direct lanes;
   `WorkspaceAppRoutes` no longer registers `dm/:catId`. The platform router
   redirects `/code/dm/:catId` and `/work/dm/:catId` to `/chat/dm/:catId`
   before the Code or Work app boots, so none of their direct-lane state runs.
2. **Work War Room "Open {actorName}" opens the Cat profile**
   (`/entities/cats/:catId`), because "open" reads as viewing the Cat. A control
   whose label says the user will talk to the Cat links to Chat's direct message
   instead.
3. **Code and Work render every new-conversation draft through the shared
   draft**, including `/new?cat=<id>`, which becomes an ordinary draft with that
   Cat preselected, as in Chat.
4. **One shared draft, named for all three products.** The legacy
   `NewChatDraft.tsx` and the helpers only it uses are deleted, and the shared
   `ChatNewChatDraft` family is renamed `NewConversationDraft*`. The rename covers
   file names and exported identifiers. i18n message keys (`chat.newChatDraft.*`)
   and CSS class names keep their names, because they are runtime strings and
   renaming them adds regression risk without making the code clearer. The
   deletion and rename land as a separate change with no behavior change.
   Earlier ADRs, specs and plans keep the old names; they map as follows (all in
   `src/products/shared/renderer/components/`):
   - `ChatNewChatDraft.tsx` → `NewConversationDraft.tsx` (`NewChatDraft` →
     `NewConversationDraft`, `NewChatDraftProps` → `NewConversationDraftProps`)
   - `chatNewChatDraftSupport.ts` → `newConversationDraftSupport.ts`
   - `chatNewChatDraftSidePanel.tsx` → `newConversationDraftSidePanel.tsx`
   - `chatNewChatDraftSidePanelState.ts` → `newConversationDraftSidePanelState.ts`
   - `useChatNewChatDraftPanelState.ts` → `useNewConversationDraftPanelState.ts`
   - Identifiers containing `ChatNewChat` now say `NewConversation`.
   - Deleted with the legacy draft: `NewChatDraft.tsx`,
     `WorkspaceNewChatDraftTargetSlot.tsx`, `DraftComposerStack.tsx`,
     `ChatNewChatDraftTargetSlot.tsx`, `ComposerCatStack.tsx` and the Code and Work
     re-exports of it. The `.composerCatStack` CSS stays for
     `ComposerParticipantStack`.
5. **The shared conversation view follows the same rule** (amended 2026-10-03).
   `components/chat-view/` becomes `components/conversation-view/`, under the same
   scope: file names and exported identifiers change, i18n keys and CSS classes
   keep their names. The mapping:
   - `ChatView.tsx` → `ConversationView.tsx`, and the same prefix change for
     `ChatViewFrame`, `ChatViewTopBar`, `ChatComposerArea`,
     `ChatComposerTargetSlot`, `ChatParticipantsSection`, `ChatSidePanelSections`
     and `ChatTranscriptPanel` (`Chat…` → `Conversation…`).
   - `chatViewSupport.ts` → `conversationViewSupport.ts`.
   - Identifiers containing `ChatView` now say `ConversationView`, including
     `WorkspaceAppRoutes`' `renderConversationView`.
   - Deleted because nothing imported them: `ChatViewSidePanel.tsx`,
     `WorkspaceComposerTargetSlot.tsx`, Chat's
     `chat-view/convergencePolicyOverlay.ts`, and the Code and Work `ChatView.tsx`
     re-exports. Code and Work import the shared view directly.

## Consequences

### Positive

- One draft implementation; a draft layout change lands once.
- Direct messages look and behave the same wherever they are opened, and the
  product that owns them is unambiguous.
- Code and Work no longer need direct-message decisions of their own (helper
  chips, permission chips, Cat stack).

### Negative

- Bookmarks and history entries for `/code/dm/*` and `/work/dm/*` now open Chat.
  The redirect keeps them working, but in a different product.
- A direct-message channel previously started from Code or Work opens in Chat.
  Chat's direct-lane lookup matches on the Cat and ignores `originSurface`, so
  the existing channel is reused rather than duplicated.

### Neutral

- Direct-lane plumbing in shared workspace hooks (`useWorkspaceLocationState`'s
  `dm/:catId` match, `showingMyCatDirectLane`, the composer submit rollback path,
  `onClearDirectLane`) stays, because Chat also runs through
  `createWorkspaceProductApp`. The Code and Work leftovers (`MY_CATS_PATH_PREFIX`,
  `buildMyCatPath`, and `resolveMyCatNavigationTarget` in their
  `myCatNavigation.ts`) were removed in a follow-up, together with the unused
  per-product `appViewState.ts`, `useAppShellRouting.ts` and
  `useAppNavigationActions.ts` that predate the shared workspace app.
- No persisted data, API or contract changes; this is a renderer route change
  within the current 0.x minor line.

## Alternatives Considered

### Alternative 1: Move the Code and Work direct-message drafts onto `ChatNewChatDraft`

- **Pros**: Removes the legacy component without changing routes.
- **Cons**: Keeps a route with no product purpose and still needs Code-specific
  direct-message decisions.
- **Why rejected**: Direct messages already belong to Chat everywhere else.

### Alternative 2: Port `ComposerCatStack` and the legacy header into `ChatNewChatDraft`

- **Pros**: Preserves the old Code and Work look.
- **Cons**: Reverses the `AudienceChip` direction and contradicts Chat's tests
  that forbid the stack on direct messages.
- **Why rejected**: Moves the platform away from its own standard.

### Alternative 3: Name the shared draft `NewChatDraft`

- **Pros**: Short, and familiar from the product wrappers.
- **Cons**: All three product wrappers already live at
  `<product>/renderer/components/NewChatDraft.tsx`, and Chat's exports a
  `NewChatDraft` component. The same basename on a shared component is the
  confusion that produced the `ChatNewChatDraft` name.
- **Why rejected**: `NewConversationDraft` follows the terminology and is unique.

## References

- [ADR-067](067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md) (superseded)
- [SPEC-068](../specs/SPEC-068-new-code-draft-canvas-and-renderer-ownership.md)
- [SPEC-102](../specs/SPEC-102-lobby-sidebar-ia-and-entity-routes.md)
- [PLAN-091](../plans/PLAN-091-lobby-sidebar-and-entity-routes-rollout.md)
- [docs/terminology.md](../terminology.md)

---

*Decision made: 2026-10-03*
*Decision makers: Owner, Claude*
