# Terminology

> Short definitions used in this project.

## Standards and Protocols

| Term | Meaning |
|------|---------|
| AAIF | Agentic AI Foundation; "the neutral and open foundation built on transparency, collaboration, and standardization to advance the public interest in agentic AI innovation." |
| AGENTS.md | "A simple, open format for guiding coding agents, used by over 60k open-source projects. Think of it as a README for agents." |
| MCP | Model Context Protocol; see modelcontextprotocol.io for the official description. In this project, MCP refers to agent-to-tool integration. |
| A2A | "An open protocol enabling communication and interoperability between opaque agentic applications." |
| Agent Card | An A2A discovery artifact that describes identity, interfaces, capabilities, auth posture, and skill metadata for a future interoperable agent surface. |
| Project Memory | Durable repo knowledge kept in markdown docs such as research, ADRs, specs, plans, `PROGRESS.md`, and `ROADMAP.md`. |
| Repo collaboration skill | A local `SKILL.md` package that teaches same-environment agents how to work with protocol artifacts and project memory without becoming a second durable state store. |

## Product Terms

| Term | Meaning |
|------|---------|
| Cats Inc | The parent product platform. |
| Cats Chat | The chat-first product surface in the Cats platform. |
| Cats Work | The work and operations product surface in the Cats platform. |
| Cats Core v1 | The shared product contract layer for identity, actors/resources, permissions, conversations, approvals, owner profile, and archive metadata. |
| Chat | A topic-centered conversation thread inside `Cats Chat`. Chat is the primary navigation unit, even when one or more Cats participate in it. |
| Cat | A reusable product-facing identity in the Cats platform. In the long-range model, a Cat is a user-facing projection over a reusable `Entity`, often but not always backed by an execution-capable `Agent`. |
| Guide Cat | The canonical product and developer term for the optional first helper offered during setup. Guide Cat is a Cat identity that may help across `Chat`, `Work`, and `Code`, but it is not automatically the same thing as `Boss Cat` or the invisible orchestration layer. Guide Cat is now also framed as an optional low-privilege surface-assist capability. |
| Boss Cat | The user-facing product term for the default public orchestrator and transport-facing Cat. Boss Cat is a coordinator capability layered above the shared interaction engine; it is distinct from the current-turn recipient slot and is not automatically the front-stage counterpart for every new chat. |
| Companion | A product-facing companion capability that leverages agent execution for direct-lane conversation and background/offline help such as photo triage, memory extraction, and owner-facing summaries. Companion is not a separate interaction-engine topology. |
| Default Boss Cat | The auto-provisioned neutral Boss Cat available before the user renames, personalizes, or replaces it. |
| Primary Orchestrator Cat | The formal product and domain term for the Cat selected as the default public orchestrator. In UI copy, this should usually be presented as `Boss Cat`. |
| Boss Chat | Historical term for an orchestrator-first chat where unmentioned turns route to `Boss Cat`. Newer Chat docs should prefer recipient and dispatch-policy language instead of expanding `Boss Chat` semantics. |
| Direct Cat Chat | A Cat-scoped private-lane mode where one chosen Cat is the default direct counterpart for ordinary turns. When opened from `My Cats`, it is an in-place lane, not a normal `Recents` thread. |
| Group chat | A chat with more than one participant. Group chat may expose one or more default recipients plus a dispatch policy; it is not defined by a permanent lead Cat. |
| My Cats | A lightweight sidebar roster for quick Cat access, in-place private-lane entry, and transport ownership hints. Selecting a Cat opens that Cat's direct lane in place and does not create a normal `Recents` thread. It is not the full registry management surface. |
| Chat view mode | The sidebar list mode used to organize chats, such as `Latest`, `By Cat`, or `By Chat Type`. |
| Cat registry | The chat-global list of reusable cats that can be assigned into one or more chats. Full management lives under `Settings > Cats`. |
| Agent registry | The broader platform-owned registry of reusable entities/agents and their capabilities. Chat rosters, `My Cats`, and Work-side agent views are projections over this registry rather than separate sources of truth. |
| Bot binding | A product record that maps one external bot identity to one visible Cat/Agent identity plus routing policy, inbox scope, and transport configuration. One environment may have many bot bindings. |
| Cat-bound inbox | One external transport thread owned by one specific bot binding, such as a Telegram DM with `將將_bot` or `醜醜_bot`. |
| Cat assignment | The channel-scoped record that decides whether a chat-global cat is active in one chat and which execution target it should use there. |
| Awake | The user-facing lifecycle state for a Cat that currently has an active runtime session in one chat. |
| Sleeping | The user-facing lifecycle state for a Cat that still belongs to a chat but does not currently have an active runtime session there. |
| Waking up | The user-facing lifecycle state for a Cat whose wake request is in progress. |
| Put to sleep | Closing a chat-scoped runtime session without removing the Cat from the chat. |
| Active chat limit | The maximum number of chats in which a given class of Cat is allowed to stay awake at once. The first slice should configure this separately for `Boss Cat` and `Other Cats`. |
| Transport binding | The product-owned relation between one external transport thread/account and one canonical Cats entry path, such as a Telegram DM mapped into a Cat's direct lane. A transport binding may reference a bot binding, but it is not the same thing as conversation identity or runtime session identity. |
| Spawned room | A normal `Cats Chat` room that a Cat created or continued from a transport-bound private lane so it can appear in `Recents` and hold canonical topic work. |
| Routing layer | The product-owned system layer that resolves mentions, default targets, wake-before-route behavior, and per-room routing mode before prompts are sent to runtime sessions. |
| Entity | The broader reusable identity model the platform is moving toward. It is expected to subsume Cats, owner-facing helpers, system-facing specialists, and other named collaborators with prompt, memory, and execution metadata. |
| Agent | An execution-capable entity that can chat, run tools, perform background work, or serve transport-facing tasks. An Agent is not automatically a participant in every conversation. |
| Conversational Agent | An agent whose primary product projection is chat-first interaction, direct-lane presence, companion behavior, or transport-facing persona. `My Cats` is primarily a roster of conversational and selected hybrid agents. |
| Operational Agent | An agent whose primary product projection is work-first management, including assignments, missions, runs, schedules, approvals, and outputs. OpenClaw-style agents are the canonical example. |
| Hybrid Agent | One shared agent identity that intentionally supports both conversational and operational projections across Chat and Work. |
| Participant | One entity or agent's membership inside one conversation context, including role, status, and execution lease. |
| Current-turn recipient | The participant or implicit model target that the next outgoing message is addressed to. The composer slot next to Send should represent current-turn recipient(s), not the whole room roster. |
| Implicit recipient | A provider/model-backed execution target shown in the composer when the next turn is aimed at pending provider/model selection rather than at a named participant. |
| Dispatch policy | The per-turn rule that decides whether the selected recipients should reply `sequentially` or `concurrently`. Dispatch policy is separate from recipient selection and from later workflow continuation. |
| Parallel Chat | The Cats Chat product mode that binds multiple isolated child chats into one comparison container. `Parallel Chat` is distinct from thread-internal concurrent dispatch inside one chat thread. |
| Conversation topology | The stable shape of a conversation such as direct lane, single-counterpart thread, or team room. Topology answers "what kind of room is this?" rather than "who should answer the next turn?" or "how should that turn dispatch?" |
| Turn strategy | The per-turn execution shape such as default recipient routing, explicit mention routing, sequential handoff, concurrent dispatch inside one thread, or later converge behavior. Turn strategy should not be confused with participant class. |
| Convergence policy | The rule that decides how multi-lane outputs should be resolved after concurrent fan-out, such as `keep_all`, `pick_one`, `synthesize_one`, or `promote_one_continue`. |
| Skill profile | A product-owned capability mapping that decides which runtime skill names should be requested for a Cat in a given room or transport context. |
| Runtime skill catalog | The `cats-runtime` hosted catalog of execution-ready `SKILL.md` packages that can be validated, resolved, and mounted into sessions. |
| Runtime skill manifest | The product-to-runtime request payload that carries requested skill names plus optional context metadata for one session or wake flow. |
| Preview surface | A normalized product-facing reference to a preview-capable runtime output, such as a local service URL or HTML artifact, that `cats` may choose to embed inline or open externally. |
| MCP profile | A product-owned tool capability posture that decides what class of MCP/tools a Cat should receive in a given room or transport context. |
| Tool intent manifest | The product-to-runtime request payload that expresses desired tool access in stable logical terms such as profile id, allowlist, or lazy tool groups. |
| Lazy tool activation | A runtime strategy that realizes the smallest useful tool surface at first and activates additional tool groups or MCP-backed servers only when needed. |
| Actor / Resource | The broader `Cats Core v1` term for a human, orchestrator, worker, stakeholder, virtual friend, or other reusable participant. |
| Execution target | The provider/model preference selected for a cat or orchestrator in one context. |
| Execution lease | The currently active runtime session metadata used to execute work through a provider. |
| Leased session | The preferred lifecycle for reusable helper intelligence such as `Guide Cat`: wake on demand, reuse briefly when still warm, and close when idle rather than staying always-on. |
| Memory checkpoint | Product-owned summary data, facts, and open loops that should survive session restarts or provider changes. |
| Owner profile | Structured product-owned memory for the boss or owner, including tone, preferences, escalation thresholds, and decision style. |
| Approval loop | The product state where an owner must approve, redirect, or reject a proposed action before dispatch or reply. |
| Escalation | Routing a sensitive or uncertain request into an owner-facing review path. |
| Takeover | Letting the owner speak through the orchestrator or bot identity for one interaction. |
| Operational search | Full-text or structured retrieval over live product-owned conversation and task records. |
| Archive / RAG | The later-stage pipeline that stores archived transcripts or artifacts for embeddings and cross-chat retrieval. |
| Runtime boundary | The stable service seam between `cats` and `cats-runtime`. |

## Interaction Core Terms

| Term | Meaning |
|------|---------|
| Container | An optional parent grouping that owns one or more conversations, such as a parallel-comparison surface. |
| Conversation | One durable interaction boundary with its own transcript and execution state. |
| Turn | One user- or system-initiated dispatch cycle inside a conversation. |
| Lane | One stable target-specific response track inside a turn. Lane identity is durable and must not be conflated with runtime session identity. |
| Segment | One lane-local product-visible unit such as text, tool, or status delivery. A segment is product-normalized and is not required to equal a provider-native block or chunk. |
| Session | One runtime attachment generation for a lane. `sessionId` is ephemeral runtime identity, not durable lane identity. |
| Scheduler policy | The rule that decides whether lanes activate serially or concurrently. |
| Sharing policy | The rule that decides whether execution happens in one shared conversation, isolated child conversations, or another bounded context-sharing model. |
| Coordinator capability | An optional capability layer, such as `Boss Cat`, that may influence routing or orchestration without redefining the core interaction model. |
| Concurrent response cluster | The product projection for one concurrent turn inside one conversation. It groups many stable lanes under one user-turn fan-out. |
| Parallel container | A parent grouping that owns many child conversations, such as `Parallel Chat` or future `Peer code`. It is not the same thing as a concurrent response cluster. |
| Materialization | The process by which interaction outcomes become durable structured product state outside the transcript projection. |
| Mutation | A structured output proposing or applying a change to durable product state. |
| Artifact | A durable output such as a spec, plan, code change, test result, preview, or review record. |
| Reference | A structured pointer linking interaction state to files, workspaces, repos, conversations, or other resources. |
| Projection | A product-specific view over shared canonical state, such as a chat transcript, work dashboard, or code review pane. |
| Runtime capability profile | The normalized description of how much delivery richness a runtime/backend exposes, such as rich streaming, text streaming, or terminal-only result delivery. |
| Normalized delivery event | A product-owned runtime event used by transcript, repair, replay, and materialization logic after adapter-specific payloads have been normalized. |
| Guide Cat assist capability | The optional low-privilege assist layer that may generate greetings, prompt chips, helper copy, and contextual suggestions for setup, lobby, chat entry, or other surfaces, while degrading cleanly into deterministic fallback when unavailable. |
| Execution profile | A durable preset or binding that captures runtime-affecting inputs such as `cwd`, worktree mode, permission profile, tool/skill profile, and memory profile for a participant, lane, or child conversation. |
| New Code | The one-person `Cats Code` entry preset that creates one primary coding conversation. |
| Team Code | The shared-room `Cats Code` entry preset that creates one multi-participant coding conversation with workflow policy. |
| Peer Code | The branch/review `Cats Code` entry preset that creates one parallel container with many child coding conversations and optional automation policies. |

## Execution and Work Terms

| Term | Meaning |
|------|---------|
| Managed Work | The operator-facing family of durable planning records such as goals, projects, requirements, backlog items, issues, tasks, and approvals. |
| Work Task | One operator-managed durable task record inside Managed Work. A Work task is not automatically the same thing as a mission or run. |
| Mission | An agent-delegated work unit that bridges managed work, interaction context, and execution. One Work task may spawn many missions; some missions may remain internal and never become Work tasks. |
| Assignment | An optional synonym for a mission when a product surface wants user-facing wording like "assigned to this agent." New shared contracts should still prefer `Mission`. |
| Run | One concrete execution attempt for a mission, such as one CLI/model session, tool batch, build, or retry. |
| Schedule | A durable rule that can create or activate missions later, such as a cron schedule or recurring automation rule. |
| Trigger | The immediate event that starts work, such as a cron tick, webhook, transport ingress, owner click, or workflow continuation. |
| Job | An overloaded legacy term. In new Cats docs and contracts, prefer `Mission` for delegated work and `Run` for concrete execution attempts unless an external system explicitly requires the word `job`. |

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

Last updated: 2026-04-14
