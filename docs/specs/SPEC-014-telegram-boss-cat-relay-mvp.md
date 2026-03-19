# SPEC-014: Telegram Boss Cat Relay MVP

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Ready for Specialist Handoff) |
| **Owner** | Codex |
| **Reviewer** | User / Telegram workstream |

## Summary

`cats-inc` needs a dedicated Telegram transport seam so a single public
`Boss Cat` can later bridge Telegram inbound and outbound traffic without
entangling transport logic with the web-chat transcript flow.

The first slice should add the relay structure, status route, and webhook
ingress seam. It should not yet change the existing web chat behavior or expose
worker cats as direct Telegram senders.

## Goals

- establish Telegram as a dedicated transport layer in `cats-inc`
- keep Telegram's visible identity mapped to the `Boss Cat`
- add webhook ingress and relay status seams for the Telegram workstream
- preserve clean separation between transcript messages and transport logs

## Non-Goals

- full Telegram delivery, retries, and operator dashboards in the first slice
- exposing worker cats as separate Telegram identities
- forcing Telegram implementation details into the main chat renderer

## Requirements

### Functional Requirements

1. `cats-inc` shall expose `GET /api/transports/telegram`.
2. The status route shall report whether a Telegram bot binding exists for the
   current workspace and which `Boss Cat` it would front.
3. `cats-inc` shall expose `POST /api/transports/telegram/webhook`.
4. The webhook route shall accept Telegram updates and route them through a
   dedicated relay component rather than directly into chat handlers.
5. The relay shall keep dedupe state for processed update ids.
6. The relay shall maintain a mapping seam between Telegram chats and internal
   conversation ids, even if the first slice uses placeholder mappings.
7. Relay dedupe state and chat-to-conversation bindings should survive process
   restart so webhook retries do not rely on process-local memory only.
8. Telegram inbound traffic shall conceptually enter through the `Boss Cat`.
9. Worker cats shall remain internal orchestration resources; they shall not
   appear as separate Telegram senders in the MVP.
10. Transport status and receipts shall be separate from the main transcript.

### Non-Functional Requirements

- **Boundary ownership**: Telegram transport logic shall live under
  `src/transports/telegram/`
- **Safety**: duplicate webhook updates should be ignored safely
- **Extensibility**: the relay should support future outbound delivery and real
  conversation mapping without replacing the public route contract

## Status Contract

Illustrative response:

```json
{
  "telegram": {
    "platform": "telegram",
    "status": "bound",
    "bossCatId": "cat-smelly",
    "bossCatName": "Smelly",
    "botBinding": {
      "id": "bot-binding-telegram-global",
      "platform": "telegram",
      "botName": "smelly_bot"
    },
    "mappedConversationCount": 0,
    "lastProcessedUpdateId": null,
    "webhookPath": "/api/transports/telegram/webhook",
    "relayMode": "boss-cat-ingress",
    "note": "Telegram ingress is wired to Boss Cat. Outbound delivery remains pending."
  }
}
```

## Webhook Receipt Contract

Illustrative response:

```json
{
  "receipt": {
    "platform": "telegram",
    "status": "accepted",
    "acceptedAt": "2026-03-19T12:00:00.000Z",
    "updateId": 101,
    "chatId": "12345",
    "messageId": "88",
    "bossCatId": "cat-smelly",
    "bossCatName": "Smelly",
    "mappedConversationId": "telegram:12345"
  }
}
```

## Design Notes

- The MVP relay is a transport seam first, not the completed Telegram feature.
- A placeholder conversation mapping is acceptable in the first slice because
  it gives the Telegram workstream a stable place to swap in real mapping logic.
- Persisting relay state in a transport-side sidecar store is acceptable for the
  MVP as long as it remains separate from the main transcript model.
- The same transport seam can later support LINE with a sibling transport
  package instead of embedding platform-specific branching into chat handlers.

## Dependencies

- [SPEC-011](./SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
- [SPEC-012](./SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-014](../decisions/014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)

## Open Questions

- [ ] When Telegram creates a new conversation, should the first internal
      channel title come from Telegram chat metadata or the first message text?
- [ ] When should inbound Telegram messages create visible web transcript notes,
      if at all?

## References

- [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md)
- [terminology.md](../terminology.md)

---

*Created: 2026-03-19*
*Author: Codex*
