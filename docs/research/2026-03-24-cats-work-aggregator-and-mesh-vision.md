# Cats Work: Freelance Aggregator Pipeline and Distributed Agent Mesh

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: Cats Work product positioning, the automated freelance job-taking pipeline, and a distributed agent mesh
- **Related**:
  - `freelance-job-aggregator/` — existing scraping + matching + pipeline infrastructure
  - `cats-platform/docs/research/2026-03-24-task-substrate-as-heartbeat-foundation.md`
  - `cats-platform/docs/research/2026-03-24-cats-code-peer-review-workflow.md`
  - `cats-platform/docs/research/2026-03-24-structured-choices-design-reference.md`
  - `cats-runtime/docs/decisions/009-keep-cats-runtime-separately-packageable-with-app-managed-local-startup.md`
  - `ws-gateway/` — existing event bus (pub/sub + webhook)

---

## Core Claim

Cats Work is not just a "dashboard for viewing tasks". Its ultimate positioning is:

> **An automated pipeline from taking jobs to delivery, letting one person run
> an entire freelance company with AI, and extensible into a distributed agent
> mesh where many people jointly develop large projects.**

---

## Part 1: Freelance Aggregator Pipeline

### Vision

```
Auto-scrape jobs → AI evaluates ROI → auto-write proposal → Owner decides whether to take it
→ Boss Cat breaks it into tasks → Coder Cat implements → Peer Cat reviews
→ Owner final review → delivery → get paid → next job
```

The Owner steps in only at key decision points; everything else is automatic.

### Existing infrastructure (freelance-job-aggregator)

Capabilities already implemented in `freelance-job-aggregator/`:

**Scraping & Data**
- Multi-platform scraper framework (httpx adapter + Firecrawl adapter)
- Job normalizer (cross-platform field standardization)
- Scraping run tracking (status, history)
- PostgreSQL persistence (Alembic migrations)

**Intelligent analysis**
- GenAI analyzer (AI-driven job analysis)
- Embedding service (vectorizing job descriptions)
- Clustering engine (grouping similar jobs)
- Group manager (job group management)

**Matching and evaluation**
- Matching service (skill-based job matching)
- ROI analysis model (return-on-investment estimation)
- Cost estimate model (cost estimation)
- Skill gap analysis

**Pipeline management**
- Pipeline status tracking (Zustand store)
- Proposal generation (AI-powered)
- Market intelligence (market trend analysis)
- Simulator (revenue simulation)

**Frontend**
- Dashboard (statistics, filtering, search)
- Pipeline view (board-style job management)
- Job detail panel (job details)
- Proposal modal (proposal writing)
- Skill profile panel (skill management)

### Integration path with Cats

**Phase 1: Cats Work consumes aggregator data**

- freelance-job-aggregator acts as the data source, scraping jobs and computing matching scores periodically
- The Cats Work dashboard pulls data from the aggregator API and presents it in the Work interface
- The Owner receives a Boss Cat notification in Cats Chat: "Found 3 high-match jobs, want to take a look?"
- The Owner decides through structured choices whether to evaluate further

**Phase 2: Automatic proposal + Owner review**

- The Boss Cat automatically generates a proposal draft for high-match jobs
- The Owner reviews the proposal (approve / edit / reject)
- After approval it is submitted automatically (through each platform's API or RPA)

**Phase 3: Automatic implementation + delivery**

- Once a job is taken → the Boss Cat creates a CoreTaskRecord (task substrate)
- The Boss Cat breaks down the requirements → creates sub-tasks → assigns them to Coder Cat(s)
- The Coder Cat implements in a cats-runtime session
- Peer Cat review (1 Coder + 2 Peers workflow)
- Owner final review → approve delivery
- Deliver the result → update pipeline status → record income

**Phase 4: Closed-loop optimization**

- After each delivery, record: actual time spent / token cost / client satisfaction
- Feed it back into the ROI model to improve future job evaluation
- The Boss Cat learns the owner's job-taking preferences (Know Your Boss)
- Skill gap analysis guides which skills the owner or Cats should improve

### Owner decision points (structured choices)

Throughout the pipeline the owner needs to step in only at these points:

- **Job-taking decision**: "Take this job?" → [Take it] [Skip] [Look later]
- **Proposal review**: "Here is the proposal draft, send it?" → [Send] [Edit] [Abandon]
- **Requirement clarification**: the Boss Cat has questions about the requirements → asks the owner through structured choices
- **Delivery review**: "It's done, deliver it?" → [Deliver] [Request changes] [Discuss with Coder]
- **Exception handling**: budget overrun, deadline pressure, client adds requirements → escalation

---

## Part 2: Distributed Agent Mesh

### Vision

Distributed computing similar to SETI@Home, but the goal is not to find alien
signals; it is to **let many people contribute the idle capacity of their own AI
subscriptions to jointly develop software projects**.

```
Participant A (Claude Pro, Taipei)        ──┐
Participant B (Codex, Tokyo)              ──┼── Mesh Network ── large project
Participant C (Cursor Pro, San Francisco) ──┤
Participant D (Gemini, London)            ──┘
```

Each participant:
- Runs a cats-runtime instance (`npx cats-runtime`)
- Contributes their own CLI subscription tokens (Claude / Codex / Cursor / ...)
- Automatically takes tasks, runs reviews, and does implementation during idle time
- Shares revenue according to contribution (number of completed tasks / token consumption / quality score)

### Why it is feasible

**The waste problem of subscriptions**

Most people pay a monthly AI subscription fee but use far less than the quota
limit. An idle subscription is wasted money. The mesh pools this idle capacity,
which for participants is **passive income at zero extra cost**.

**The cats-runtime architecture supports it natively**

- **Multi-backend**: whether the participant uses Claude, Codex, Gemini, or Ollama,
  cats-runtime can abstract it into a unified session interface
- **Separately packageable** (ADR-009): one command, `npx cats-runtime`, joins the mesh
- **Standalone mode**: runs independently without the cats product layer
- **Skill injection**: each task carries a SKILL.md, so whichever node picks it up knows what to do
- **Workspace isolation**: worktree-backed sessions ensure tasks do not interfere with each other
- **Usage metering**: token tracking already exists and can serve as the basis for contribution calculation

### What needs to be built

**Discovery Layer — node discovery**

- Each cats-runtime instance registers with a registry at startup
- It exposes its capabilities (which providers it supports, current load, available quota)
- A heartbeat keeps its online status

**Routing Layer — work assignment**

- Receive a task request → match nodes according to task requirements (provider preference, skill needs)
- Load balancing (do not stuff all tasks into the same node)
- Failover (node goes offline → automatically reroute)

**Trust & Quality Layer**

- Node reputation score (completion rate, quality, speed)
- Task result verification (peer review can cross nodes)
- Malicious node protection (output quality below a threshold → downgrade)

**Settlement Layer**

- Contribution tracking (completed tasks × complexity × quality score)
- Token consumption records (cats-runtime metering already provides a basis)
- Revenue share calculation and payout

### Topology model

**Phase 1: Star Topology (centralized scheduling)**

```
         ┌─ Node A
Hub ─────┼─ Node B
         ├─ Node C
         └─ Node D
```

- One central Hub handles task dispatch and settlement
- Simplest; get the flow working first
- The Hub can be the owner's own machine or a cloud service
- ws-gateway can be extended into the Hub's event routing layer

**Phase 2: Federated Topology**

```
Hub-1 ──── Hub-2
  │          │
  ├─ A       ├─ D
  ├─ B       └─ E
  └─ C
```

- Multiple Hubs each manage a group of nodes
- Hubs can reroute tasks to each other
- Similar to Mastodon's federated model

**Phase 3: Full Mesh (decentralized)**

```
A ─── B
│ ╲ ╱ │
│  ╳  │
│ ╱ ╲ │
C ─── D
```

- Every node can communicate directly
- Decentralized scheduling (requires a consensus mechanism)
- The end-state vision, but the highest complexity

### Relationship to ws-gateway

The existing `ws-gateway/` (port 8050) is already a pub/sub + webhook event bus.
The extension path:

- **Now**: event routing between cats ↔ cats-runtime within a single machine
- **Phase 1**: add cross-network node registration + task dispatch
- **Phase 2**: Hub-to-Hub federation protocol
- **Phase 3**: P2P discovery (mDNS / DHT / relay)

### Analogies

| Concept | Traditional analogy | Cats Mesh |
|------|---------|-----------|
| Resource contributed by participants | CPU cycles (SETI@Home) | AI subscription quota |
| Unit of work | Work unit (Folding@Home) | CoreTaskRecord |
| Quality verification | Redundant computation | Peer Cat cross-node review |
| Incentive mechanism | Leaderboard / public good | Revenue share / passive income |
| Idle resource problem | Computer unused at night | AI subscription fee paid but not fully used |
| Entry barrier | Install the BOINC client | `npx cats-runtime` |

---

## Connecting Part 1 and Part 2

The freelance aggregator pipeline and the mesh are not two independent things;
they are **two running modes of the same pipeline**:

**Default Mode (Part 1)**
- One person's cats-runtime → takes jobs, does the work, and delivers by themselves
- Suits individual freelancers

**Mesh Mode (Part 2)**
- A mesh of many people's cats-runtime → take big jobs together, split the work, and deliver jointly
- Suits large projects that need multi-person collaboration
- The aggregator finds a big job → evaluates how much labor is needed → recruits nodes from the mesh
  → assigns sub-tasks → each node implements → cross-node peer review → aggregate and deliver

The Owner can start from Default Mode and open Mesh Mode after the pipeline is proven to work.

---

## Competitive Positioning

- **Paperclip**: a dashboard for managing AI agents → does not take jobs or earn money
- **OpenClaw**: a personal AI assistant → does not take jobs or earn money
- **Upwork / Fiverr**: manual freelance platforms → you do the work yourself
- **Devin / Cursor**: AI coding assistants → help you write code but do not help you take jobs
- **Cats Work**: **a fully automated pipeline from finding jobs to delivery to getting paid, extensible into a distributed mesh**

No existing product covers this full scope.

---

## Inviolable Rule: Mandatory Human-in-the-Loop

> **In the early stage, every key action must have explicit human approval; nothing may run fully automatically.**

The purpose of this rule is to avoid triggering any provider TOS or freelance
platform terms-of-use problems.

**Actions with a mandatory approval gate (cannot be skipped):**

- **Job-taking decision** — after the AI recommends a job, a human must explicitly agree before it enters the pipeline
- **Proposal submission** — after the AI writes a proposal draft, a human must review it and press send
- **Starting implementation** — after tasks are broken down, a human must agree before work is dispatched
- **Delivery confirmation** — the finished product must pass a human final review before it is delivered to the client
- **Mesh node taking a task** — the node owner must agree that their runtime accepts a specific task

**Things never to do:**

- Do not auto-submit proposals to any platform
- Do not auto-commit to deadlines or quotes
- Do not auto-deliver results to clients
- Do not consume a node owner's subscription quota without their knowledge
- Do not bypass any provider's or platform's TOS restrictions

**Design implications:**

- Every stage transition in the pipeline needs structured choices presented to a human for a decision
- Even if the pipeline matures enough in the future that its quality is trustworthy, lifting an approval gate
  must be an **item-by-item, explicit opt-in** by the owner, with no global switch
- This rule applies to both Default Mode and Mesh Mode

---

## Risks and Considerations

**Part 1 risks**
- TOS restrictions of each freelance platform — already constrained by the inviolable rule; in the early stage all submissions need manual confirmation
- Delivery quality control (whether AI-written code can meet client expectations)
- Client communication (requirement changes, added requirements) still needs human intervention

**Part 2 risks**
- Trust issues (participants may submit low-quality results)
- Data security (task content may contain sensitive information)
- Legal issues (cross-border revenue sharing, taxes, contractual liability)
- Provider TOS — already constrained by the inviolable rule; the node owner must explicitly agree to each task

**Mitigation strategies**
- Do Default Mode first in Phase 1, and open the Mesh only after the pipeline is proven
- Limit the Mesh to a trusted network (friends / colleagues) at first, not public
- Cross-node peer review serves as a quality gate
- Dispatch sensitive tasks only to high-reputation nodes
- All actions obey the inviolable rule; human approval cannot be bypassed by code

---

## Conclusion

- Cats Work's positioning is raised from "task dashboard" to "automated job-taking engine + distributed development mesh"
- freelance-job-aggregator already provides the scraping / matching / ROI / proposal infrastructure
- The cats-runtime architecture (multi-backend / standalone / metering / skill injection)
  is naturally suited to mesh mode
- Validate Default Mode first, expand to Mesh Mode later
- This positioning has no direct competitor in the existing market

---

*This document is for review discussion and covers directional thinking at the
product-vision level. Concrete implementation specifications are to be split
into independent SPEC documents.*
