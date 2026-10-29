# Cats conversation presentation

This private, locally packed candidate extracts Desktop's conversation bubble,
inline response, ordered block, Markdown and action implementation. Desktop and
Bot install the identical integrity-pinned artifact; no registry publication is
part of this slice.

The root entry exports React components. `./contracts` is pure JavaScript and
types, usable without React, DOM, Node, a Platform server or an Electron host.
Import `./conversation.css` and supply product theme variables. React 18.3 is a
peer. Product adapters supply speaker slots, translated labels, sanitized content,
attachment and mention rendering, clipboard and authorized actions. Product-owned
group/parallel/compare layouts compose the same segment body without moving
their workflows into this library. No component discovers profiles or starts a
service. Links accept HTTP(S); remote Markdown images are inert links.

Build with `npm run pack:conversation-ui` from the producer checkout. The artifact
name includes the source digest; provenance records the frozen Desktop revision.
The consumer lock records npm integrity. Editing the producer does not change an
installed consumer until its explicit artifact pin changes.
