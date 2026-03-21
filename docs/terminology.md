# Terminology

> Short definitions used in this project.

## Standards and Protocols

| Term | Meaning |
|------|---------|
| AAIF | Agentic AI Foundation; "the neutral and open foundation built on transparency, collaboration, and standardization to advance the public interest in agentic AI innovation." |
| AGENTS.md | "A simple, open format for guiding coding agents, used by over 60k open-source projects. Think of it as a README for agents." |
| MCP | Model Context Protocol; see modelcontextprotocol.io for the official description. In this project, MCP refers to agent-to-tool integration. |
| A2A | "An open protocol enabling communication and interoperability between opaque agentic applications." |

## Product Terms

| Term | Meaning |
|------|---------|
| Cats Inc | The parent product suite. |
| Cats Chat | The chat-first product surface in the Cats suite. |
| Cats Work | The work and operations product surface in the Cats suite. |
| Cats Core v1 | The shared product contract layer for identity, actors/resources, permissions, conversations, approvals, owner profile, and archive metadata. |
| Chat | The current lightweight team conversation module inside the current shell; this term is gradually being made more explicit as `Cats Chat`. |
| Cat | A reusable teammate identity used inside the current chat shell. A cat is not the same thing as a provider choice and is expected to evolve into the broader actor/resource model. `Pal` remains as an internal implementation term. |
| Boss Cat | The user-facing product term for the one visible public chat-entry Cat that leads new conversations and represents the default public orchestrator identity. |
| Primary Orchestrator Cat | The formal product and domain term for the Cat selected as the default public orchestrator. In UI copy, this should usually be presented as `Boss Cat`. |
| Boss Chat | The default conversation mode where unmentioned turns route first to `Boss Cat`, which can then coordinate or involve other Cats. |
| Direct Cat Chat | A conversation mode where one chosen Cat is the room's lead participant and unmentioned turns default to that Cat rather than to `Boss Cat`. |
| Cat registry | The workspace-level list of reusable cats that can be assigned into one or more chats. |
| Cat assignment | The channel-scoped record that decides whether a workspace cat is active in one chat and which execution target it should use there. |
| Awake | The user-facing lifecycle state for a Cat that currently has an active runtime session in one chat. |
| Sleeping | The user-facing lifecycle state for a Cat that still belongs to a chat but does not currently have an active runtime session there. |
| Waking up | The user-facing lifecycle state for a Cat whose wake request is in progress. |
| Put to sleep | Closing a chat-scoped runtime session without removing the Cat from the chat. |
| Active chat limit | The maximum number of chats in which a given class of Cat is allowed to stay awake at once. The first slice should configure this separately for `Boss Cat` and `Other Cats`. |
| Transport inbox | A single external bot-thread view, such as Telegram DM with `Boss Cat`, that acts as the operator's front-door inbox rather than the canonical transcript for all room work. |
| Spawned room | A normal `Cats Chat` room that `Boss Cat` created or continued from a transport inbox context so it can appear in `Recents` and hold canonical topic work. |
| Routing layer | The product-owned system layer that resolves mentions, default targets, wake-before-route behavior, and per-room routing mode before prompts are sent to runtime sessions. |
| Lead participant | The default target participant for a room mode when an operator turn does not contain an explicit valid `@mention`. |
| Skill profile | A product-owned capability mapping that decides which runtime skill names should be requested for a Cat in a given room or transport context. |
| Runtime skill catalog | The `cats-runtime` hosted catalog of execution-ready `SKILL.md` packages that can be validated, resolved, and mounted into sessions. |
| Runtime skill manifest | The product-to-runtime request payload that carries requested skill names plus optional context metadata for one session or wake flow. |
| Preview surface | A normalized product-facing reference to a preview-capable runtime output, such as a local service URL or HTML artifact, that `cats` may choose to embed inline or open externally. |
| MCP profile | A product-owned tool capability posture that decides what class of MCP/tools a Cat should receive in a given room or transport context. |
| Tool intent manifest | The product-to-runtime request payload that expresses desired tool access in stable logical terms such as profile id, allowlist, or lazy tool groups. |
| Lazy tool activation | A runtime strategy that realizes the smallest useful tool surface at first and activates additional tool groups or MCP-backed servers only when needed. |
| Actor / Resource | The broader `Cats Core v1` term for a human, orchestrator, worker, stakeholder, virtual friend, or other reusable participant. |
| Execution target | The provider/model preference selected for a pal or orchestrator in one context. |
| Execution lease | The currently active runtime session metadata used to execute work through a provider. |
| Memory checkpoint | Product-owned summary data, facts, and open loops that should survive session restarts or provider changes. |
| Owner profile | Structured product-owned memory for the boss or owner, including tone, preferences, escalation thresholds, and decision style. |
| Bot binding | The record that maps one external bot or transport identity to one orchestrator-facing product identity. |
| Approval loop | The product state where an owner must approve, redirect, or reject a proposed action before dispatch or reply. |
| Escalation | Routing a sensitive or uncertain request into an owner-facing review path. |
| Takeover | Letting the owner speak through the orchestrator or bot identity for one interaction. |
| Operational search | Full-text or structured retrieval over live product-owned conversation and task records. |
| Archive / RAG | The later-stage pipeline that stores archived transcripts or artifacts for embeddings and cross-chat retrieval. |
| Runtime boundary | The stable service seam between `cats` and `cats-runtime`. |

## Roles

| Term | Meaning |
|------|---------|
| Conductor | Orchestrates tasks and keeps README Current Status up to date. |
| Architect | Owns system design and tech stack decisions. |
| Security Specialist | Reviews security, compliance, and risk. |
| UX Lead | Oversees user experience and frontend standards. |
| Specialist | Executes assigned tasks and updates docs/tests as needed. |

## References

- Source: https://aaif.io
- Source: https://agents.md
- Source: https://modelcontextprotocol.io
- Source: https://github.com/a2aproject/A2A

---

Last updated: 2026-03-19
