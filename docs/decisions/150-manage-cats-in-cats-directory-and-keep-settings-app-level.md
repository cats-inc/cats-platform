# ADR-150: Manage Cats in Cats Directory and Keep Settings App-Level

## Status

Accepted — 2026-11-11. The owner asked whether Settings should still hold cats now that Cats
Directory shows cats, clowders and catteries. They then approved the recommendation:
"照你的設計做吧". Carried out by cats-platform#405 (Directory owns cat management) and #407
(each cat's settings get their own URL). Recorded in
[SPEC-102](../specs/SPEC-102-lobby-sidebar-ia-and-entity-routes.md) §Implementation Status.

This supersedes the Settings-hosted registry in
[ADR-009](009-prefer-chat-contextual-cat-entry-and-settings-registry.md) (decisions 5 and 7)
and the `/settings/cats` route in
[ADR-052](052-use-canonical-platform-settings-routes-inside-product-shells.md). ADR-009's
chat-contextual cat entry, and ADR-052's canonical `/settings/*` namespace, stand.

## Context

- Cats Directory (`/entities/*`, ADR-099) already rendered the same cats canvas as
  `/settings/cats`. The code was two copies (`components/cats/` and
  `components/settings-cats/`), plus unused Chat, Code and Work wrappers.
- Adding a cat from the Directory, or having none yet, sent the user into the Settings
  shell. SPEC-102 named this as the only reason `/settings/cats` survived.
- One cat's settings were split. The profile at `/entities/cats/:id` showed its Telegram
  binding but linked to Settings to change it. The model-attention mark on an avatar also
  opened Settings.
- SPEC-103 gives Clowders and Catteries their own Settings tabs. Cats were the only entity
  with a second home.

## Decision

1. Cats Directory is the only place to list, add and edit cats. `/entities/cats/new` adds
   a cat; `/entities/cats/:catId/settings` edits one; `/entities/cats/:catId` stays the
   profile.
2. Settings keeps app-level pages only. It has no Cats group. Assistants (Catlas and assistant
   presets) is its own item: they are not Directory cats.
3. `/settings/cats` and `/settings/cats/new` are removed with no redirect. This matches how
   `/settings/cats/my-cats` was retired. `/settings/cats` stays reserved against App routes.
4. A cat's settings URL is the only source of the selected cat. No navigation state or
   component state names a second one.
5. A preference that applies to every cat is app-level and may return to Settings as its own
   page. Per-cat values never go there.

## Consequences

### Positive

- One implementation of the cats canvas, and one address family per cat.
- Adding a first cat stays inside the Directory shell.
- Deep links (model attention, Telegram, conversation "Edit settings") land on the cat's own
  settings.

### Negative

- The settings form and the profile are still two pages joined by links. Folding them into
  one tabbed page needs the owner to review the layout.
- SPEC-139 FR-8 (one join policy for every Boss Cat) was written for "Settings › Cats".
  Applying decision 5, the owner placed it on a small Settings page, 「主控貓」
  (`/settings/boss-cat`), on 2026-11-11. SPEC-139 FR-15's per-Cat switch goes on the Cat's
  Directory settings.

### Neutral

- The shared `useSettingsCats*` hooks keep their names; renaming them is cosmetic.
