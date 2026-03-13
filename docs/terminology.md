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
| Chat | The current lightweight team conversation module inside Cats Inc. |
| Pal | A reusable teammate identity used inside Chat. A pal is not the same thing as a provider choice. |
| Workspace pal registry | The workspace-level list of reusable pals that can be assigned into one or more chats. |
| Pal assignment | The channel-scoped record that decides whether a workspace pal is active in one chat and which execution target it should use there. |
| Execution target | The provider/model preference selected for a pal or orchestrator in one context. |
| Execution lease | The currently active runtime session metadata used to execute work through a provider. |
| Memory checkpoint | Product-owned summary data, facts, and open loops that should survive session restarts or provider changes. |
| Runtime boundary | The stable service seam between `cats-inc` and `cats-runtime`. |

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

Last updated: 2026-03-13
