# AGENTS.md

> Cross-agent guidelines following [AAIF](https://aaif.io) standards.
> All AI agents (Claude, Gemini, Codex, etc.) MUST read this file first.

## Instruction Priority and Compliance

### RFC 2119 Keywords

This document uses RFC 2119 keywords to indicate requirement levels:

| Keyword | Meaning | Compliance |
|---------|---------|------------|
| **MUST** / **REQUIRED** | Absolute requirement | Mandatory - failure to comply is a critical error |
| **MUST NOT** / **SHALL NOT** | Absolute prohibition | Mandatory - violating this is a critical error |
| **SHOULD** / **RECOMMENDED** | Strong suggestion | Highly recommended unless good reason not to |
| **SHOULD NOT** / **NOT RECOMMENDED** | Strong discouragement | Should be avoided unless good reason |
| **MAY** / **OPTIONAL** | Truly optional | Use discretion |

### Instruction Priority Hierarchy

When instructions appear to conflict, follow this priority order (highest to lowest):

1. **Security and Safety**: Never compromise security or user data
2. **MUST/MUST NOT directives**: Absolute requirements from this file
3. **Agent-specific file directives**: Requirements from your `<AGENT>.md` file
4. **SHOULD/SHOULD NOT recommendations**: Strong suggestions
5. **Best practices**: General guidance
6. **User preference**: Explicit user instructions override lower priorities but not security

### Common Mistakes to Avoid

**DO NOT:**
- Edit other agents' specific files (each agent owns their own file)
- Skip reading AGENTS.md when starting a new session
- Ignore the `dyu` command - always confirm you've read instructions
- Make architectural decisions when a Conductor is assigned
- Commit without updating related documentation
- Mix multiple unrelated changes in one commit
- Modify core architecture without documenting in ADR
- **Write demo / test / smoke / "verification" records into the user's
  dev disk state** — see `## State Hygiene Policy` below for the full
  rule and the narrow set of allowed alternatives.

**DO:**
- Read AGENTS.md and your agent-specific file at the start of every session
- Confirm understanding when asked "dyu"
- Check for existing documentation before creating new files
- Update tests when modifying code
- Follow the Development Workflow for all changes
- Ask for clarification when instructions are unclear
- Respect file ownership boundaries

### Enforcement and Validation

Agents SHOULD self-validate compliance by:
1. Re-reading critical sections of AGENTS.md before major actions
2. Checking that file modifications align with file ownership rules
3. Verifying that changes follow the Development Workflow
4. Confirming that MUST/MUST NOT directives are being followed

If an agent realizes it has violated a MUST/MUST NOT directive:
1. **Stop immediately**
2. **Inform the user of the violation**
3. **Propose corrective action**
4. **Do not proceed until correction is approved**

### Codex-Only Git Guardrails

> **Codex only**: Other agents may ignore this subsection.

- Codex MUST NOT run dependent Git commands in parallel. If one command changes
  repo state or determines the validity of the next command, run it first,
  inspect the result, then run the next step.
- Codex MUST keep `fetch -> rebase`, conflict resolution `-> --continue`, and
  `commit -> push` as separate sequential steps.
- Codex MUST inspect repo state after each state-changing Git step before
  issuing the next one.
- Codex MUST use non-interactive Git continue flows in this workspace and MUST
  NOT rely on terminal editors during `rebase --continue`,
  `cherry-pick --continue`, or `merge --continue`.

---

## Project Metadata

- **Type**: single-project
- **Subprojects**: N/A

> **Monorepo Detection Rule**: If a first-level subdirectory contains its own `AGENTS.md`, that directory is considered a subproject, and this project is treated as a monorepo.

---

## Project Overview

**Purpose**: Shared planning and product application repo for the cats platform.

**Background**: Earlier exploratory chat prototypes proved useful product ideas
but were directly coupled to lower-level runtime backends. `cats` now carries
two jobs:
it is the current Node.js/TypeScript product shell, and it is the planning home
for shared `Cats Core v1` contracts that `Cats Chat`, `Cats Work`, and
`Cats Code` must reuse. The project MUST continue to depend on
`cats-runtime` as its runtime boundary.

**Key Features**:
- Shared `Cats Core v1` domain contracts for actors, channels, approvals,
  owner profile, and archive metadata
- Chat-first product shell above runtime-backed agent sessions
- Parallel `Cats Chat`, `Cats Work`, and `Cats Code` product trees that reuse
  the same shared product contracts
- Shared platform design layer in `src/design/` plus product-owned renderer
  surfaces above it
- Product-owned API delegates and server dependency slices for platform-host
  integration
- Runtime integration through `cats-runtime` direct APIs, with a planned MCP
  facade for orchestrator-style tool use

---

## Current Product Direction

- `Cats Chat`, `Cats Work`, and `Cats Code` now share one platform host and one
  `Cats Core v1` contract layer, and should be treated as parallel product
  tracks rather than ad hoc one-off expansions.
- `Cats Chat` remains the most mature launch surface inside this repo, but
  Work and Code are no longer speculative enough to justify Chat-centric shared
  contracts or platform-host wiring.
- The full desktop surfaces for `Cats Chat`, `Cats Work`, and `Cats Code`
  should stay on one React/TypeScript renderer stack inside the Electron host
  chosen by ADR-003.
- `Cats Core v1` should stay minimal: shared identity, actors/resources,
  permissions, conversations, bot bindings, tasks/approvals, owner profile, and
  archive metadata.
- `cats-runtime` remains the only runtime boundary. Product services should use
  direct APIs; MCP is an additional tool surface for orchestrators, not a
  replacement boundary.
- Product teams should integrate through product-owned API delegates and the
  platform host registration protocol documented in
  `docs/product-integration-guide.md`.
- Shared visual primitives may live in `src/design/`, but product-specific UI
  behavior should remain in the owning product tree unless a real multi-product
  use case has been proven.
- The platform host is integration-owned. Product teams should not directly grow
  `src/app/server/**` as part of routine feature work.
- The shared-contract freeze for parallel delivery currently includes:
  - `src/core/types.ts`
  - `src/platform/orchestration/contracts.ts`
  - `src/shared/roomRouting.ts`
  - `src/products/chat/api/contracts.ts`
- Flutter and Tauri are not part of the current execution path. If a mobile
  client is added later, treat it as a companion scope rather than a second
  full primary shell. The current bootstrap direction is a companion
  React Native / Expo app under `mobile/`, not a second desktop-first shell.
- The Paperclip-derived control-plane documents remain useful research, but
  they are exploratory and not the current execution path unless explicitly
  reactivated.

---

## Pre-Release Compatibility Policy

- This product has never had a public or stable release. Agents MUST treat
  legacy product surfaces, stale room modes, deprecated contracts, and
  exploratory prototypes as replaceable implementation history, not
  compatibility targets.
- When changing product or runtime contracts, remove the obsolete path in the
  same change instead of preserving adapters, aliases, fallback branches, or
  compatibility shims that only support unreleased behavior.
- Keep the architecture correct and lean. Update tests and documentation to the
  current contract instead of layering support for old flows or unnecessary
  aliases.

---

## State Hygiene Policy

Cats dev runs against the user's **real persisted state** (disk file
`~/.cats/platform/state/chat-state.local.json` via `FileChatStore`).
Anything the dev server writes shows up in the user's UI as if the user
wrote it, and persists across sessions and across agent handoffs.

### MUST NOT — agents do not write demo / verification data to dev state

Agents (Claude, Codex, Gemini, et al.) MUST NOT POST, PUT, or otherwise
write **demo / smoke / "let me just test the chip" / "verification"
records** to:

- `~/.cats/platform/state/chat-state.local.json` (or any backup /
  alternate path resolved by `resolvePlatformStatePath`)
- Any persisted Core record (Project / WorkItem / Task / Run / Activity
  / Artifact / Outcome / Approval / WorkGraphLink / Conversation /
  etc.) created via `/api/...` endpoints, runtime calls, or direct file
  edits, while operating against the user's running dev server.

Historical incidents this rule responds to:
- A prior session left an orphan task titled "Real-data smoke test".
- A subsequent session left another orphan task titled
  "PRODUCT-BINDING demo task".

Both were written intending to verify a UI surface and were forgotten /
mis-attributed in a later session, polluting the user's data.

### Why writes are forbidden by default

1. **Indistinguishable from real work.** `ownerActorId` is always
   `actor-owner` in single-tenant dev — agent writes look like user
   writes in every audit field.
2. **Cross-session persistence.** Disk state survives restarts. The
   next agent session sees the residue and may treat it as canonical
   data.
3. **No audit trail.** There is no per-record provenance field naming
   the writing agent. Once written, the residue is undebuggable.
4. **Verification rationale is weak.** UI rendering can almost always
   be verified without writing — see allowed alternatives below.

### Allowed alternatives — verify without polluting

When an agent thinks "I need to write a record to verify something,"
the answer is almost always one of:

- **Read existing state** (`GET /api/work/graph`, `GET /api/core`,
  etc.) and confirm projection-level fields are present in the
  response. Most verifications are about *whether the projection adds
  the field*, not *what the UI does with one*.
- **Read the source / diff** to confirm the data path. If the change
  is purely additive (new optional field), code review is the
  verification.
- **Wait for the user to create a record organically** during their
  next interaction, then verify against that.
- **Use the test-only fixtures in `cats-platform/tests/fixtures/`**
  (e.g. `sampleWorkGraph.ts`) — these build their own
  `MemoryCoreStore` and never touch user disk.
- **Run a targeted node:test file** that builds an isolated
  `MemoryCoreStore`, exercises the projection, and asserts the field
  shape. Tests do not write to user disk.

### Narrow exception — explicit user approval per write

If, after considering all alternatives, an agent still believes a
write to user dev state is necessary, the agent MUST:

1. **Tell the user before writing**, including the exact title /
   payload it will create.
2. **Wait for explicit approval** in chat (a message from the user;
   not inference from an earlier turn).
3. **Delete the record immediately after verification, in the same
   turn**, AND verify the delete by reading the persisted file (not
   only the API).
4. **Report the cleanup explicitly**, including the file-level
   evidence ("disk file no longer contains the id").
5. **If interrupted, stop and report the residue**. Do not continue
   the original task while leaving residue.

### Severity

A violation that leaves residue counts the same as committing
unrelated dummy code into a release branch. Required response on
discovery: stop, apologise, clean up, log the incident in the
Claude-specific memory (or equivalent agent memory) so the next
session does not repeat the pattern, and consider whether the
pattern needs a code-level guardrail (e.g. dev-server seal mode).

---

## Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 22+ |
| HTTP | Built-in `node:http` + `fetch` | Node native |
| Testing | `node:test` | Node native |
| Build | TypeScript compiler | 5.x |
| Linting | TypeScript typecheck | 5.x |

**Additional Tools**:
- `cats-runtime`: stable runtime facade for upper-layer apps
- `project-bootstrap`: AAIF-compliant project scaffolding

---

## Development Workflow

<!-- Overview of the development process. See detailed sections below for specific rules. -->

```
1. Plan     → Create spec in docs/specs/ (for complex features)
2. Branch   → Create feature/fix branch
3. Implement→ Follow Coding Conventions
4. Test     → Run tests (see Testing Protocols)
5. Commit   → Use Conventional Commits format
6. PR       → Submit PR (see PR Guidelines)
7. Review   → Peer review + CI checks
8. Merge    → Squash and merge
```

**Quick Reference**:
- Specs & Plans: `docs/specs/`, `docs/plans/`
- Decisions: `docs/decisions/` (ADR)
- Product integration: `docs/product-integration-guide.md`
- Shortcuts: `cnp` (commit & push), `umd` (update docs)

---

## Agent Reading Order

**CRITICAL**: All agents MUST follow this reading order before taking any action:

1. **MUST read this file first** (`AGENTS.md`) - Stop after reading and confirm understanding
2. **MUST read your agent-specific file**:
   - Claude → `CLAUDE.md`
   - Gemini → `GEMINI.md`
   - Codex → `CODEX.md`
3. **MUST consult `docs/AGENT-GUIDE.md`** for project-specific SOPs before performing tasks
4. **MUST NOT read other agents' specific files**

### Document Responsibilities

| Document | Contains | When to Consult |
|----------|----------|-----------------|
| `AGENTS.md` | Rules, conventions, structure | Always read first |
| `CLAUDE.md` / `GEMINI.md` / `CODEX.md` | Agent-specific configs | After AGENTS.md |
| `docs/AGENT-GUIDE.md` | Project SOPs, domain knowledge, common task procedures | When performing tasks |
| `docs/product-integration-guide.md` | Parallel product registration, dependency-slice, and platform-host integration rules | When touching product boundaries or platform-host wiring |

---

## Command Aliases

When the user uses these shortcuts, you MUST execute the corresponding action exactly as specified:

| Alias | Meaning | Required Action |
|-------|---------|----------------|
| `dyu` | Do you understand | **MUST** read project root `AGENTS.md`, then read your agent-specific file (e.g., `CLAUDE.md`). **MUST** respond with exactly: "I am [Agent Name], and I understand." to confirm reading completion. Do NOT take any other action until confirmation is given. |
| `cnp` | Commit and push | **MUST** stage all changes with `git add .`, create a commit with an appropriate message following Conventional Commits format, and push to remote. |
| `umd` | Update markdown docs | **MUST** review and update all relevant markdown documentation affected by recent changes. |
| `rlc` | Review last commit | **MUST** review the last commit for potential issues (logic errors, missing files, incorrect changes, etc.) and report findings. |

### Command Execution Rules

1. **Execute immediately**: When a command alias is given, execute it before asking clarifying questions
2. **Complete execution**: Do not partially execute - complete the full action sequence
3. **Confirm completion**: After execution, report what was done

---

## Project Structure Convention

### Required (Root Level)

```
project-root/
├── README.md              # Project overview + Current Status
├── ROADMAP.md             # Long-term planning
├── PROGRESS.md            # Work packages and implementation status
├── CONTRIBUTING.md        # Contribution guide
├── LICENSE                # MIT License
│
├── AGENTS.md              # This file - cross-agent rules
├── CLAUDE.md              # Claude-specific
├── GEMINI.md              # Gemini-specific
├── CODEX.md               # Codex-specific
│
├── .gitignore
├── .gitattributes
├── .editorconfig
├── .env.example
│
├── src/                   # Source code (required)
├── tests/                 # Test files (required)
└── docs/                  # Documentation (required)
```

### Optional Directories

```
├── skills/                # Agent Skills (see Agent Skills section)
│   ├── README.md
│   └── <skill-name>/
│       └── SKILL.md
│
├── scripts/               # Build/deployment scripts
│   ├── windows/           # PowerShell (.ps1), Batch (.bat, .cmd)
│   ├── linux/             # Bash (.sh)
│   └── macos/             # Bash (.sh), Zsh
│
├── config/                # Configuration files
│   └── *.yaml.example     # Config templates
│
└── assets/                # Static resources
    └── images/, fonts/, etc.
```

### For Monorepo Subprojects

Each subproject directory should contain:
- `AGENTS.md` (subproject-specific rules)
- `README.md`
- `CLAUDE.md`, `GEMINI.md`, `CODEX.md` (if needed)
- `.gitignore` (if different from root)
- `docs/` (subproject documentation)

---

## Agent Skills

This project supports [Agent Skills](https://agentskills.io), an open standard adopted by Claude Code, Codex, and Gemini CLI for structured, reusable agent instructions.

### How It Works

Skills live in `skills/` (version-controlled) and are synced to each agent's discovery path via `Sync-AgentSkills.ps1`. Each agent automatically discovers skills from its own directory.

| Agent | Discovery Path |
|-------|---------------|
| Claude Code | `.claude/skills/<name>/SKILL.md` |
| Codex | `.agents/skills/<name>/SKILL.md` |
| Gemini CLI | `.gemini/skills/<name>/SKILL.md` |

### Syncing Skills

After adding or modifying skills, run:
```powershell
.\scripts\windows\Sync-AgentSkills.ps1
```

See `skills/README.md` for full details on the SKILL.md format and available skills.

---

## Naming Conventions

### Directories

| Rule | Convention | Example |
|------|------------|---------|
| All directories | lowercase + kebab-case | `user-service/`, `api-gateway/` |

### Files by Type

| Type | Convention | Example |
|------|------------|---------|
| Python | snake_case | `user_service.py`, `test_user.py` |
| JavaScript/TypeScript | camelCase or kebab-case | `userService.ts`, `user-service.ts` |
| React Components | PascalCase | `UserProfile.tsx`, `NavBar.jsx` |
| Configuration | lowercase | `.env`, `config.yaml` |
| Example files | `*.yaml.example` | `config.yaml.example` |

### Scripts by Platform

| Platform | Convention | Example |
|----------|------------|---------|
| Windows (PowerShell) | PascalCase Verb-Noun | `Setup-Environment.ps1` |
| Linux/macOS (Bash) | kebab-case | `setup-environment.sh` |

---

## Coding Conventions

### General Principles

- **DRY** (Don't Repeat Yourself): Extract common logic into reusable functions
- **KISS** (Keep It Simple, Stupid): Prefer simple solutions over complex ones
- **Single Responsibility**: Each function/class should do one thing well

### Code Style

> **Note**: This project uses `.editorconfig` for consistent formatting. All agents MUST respect `.editorconfig` settings (indentation, line endings, final newline, etc.).

| Aspect | Convention |
|--------|------------|
| Indentation | 2 spaces |
| Line length | 100 characters |
| Quotes | Single |
| Trailing commas | Yes |
| Semicolons (JS/TS) | Yes |

### Language-Specific Rules

#### TypeScript
- Always use strict mode
- Prefer `interface` over `type` for object shapes
- Use `async/await` over raw Promises
- Avoid `any` type; use `unknown` if type is uncertain

### Error Handling

- Keep transport errors explicit and structured
- Return minimal JSON error payloads from HTTP handlers
- Do not leak secrets or upstream auth tokens in error messages

### Dependency Injection

- Pass collaborators like runtime clients into server factories
- Avoid hidden global singletons where a constructor parameter will do

### Settings UI Conventions

- **MUST NOT** render inline feedback (success or error) for any value-change
  in a Settings page. Examples of forbidden patterns: a `<p className="feedbackText">`
  glued under a card, an inline error string injected next to a control, a
  `feedback?: string` prop slot on a Settings primitive that the page renders
  in place.
- **MUST** use the existing `useToast()` / `<ToastContainer>` from
  `src/design/components/Toast.tsx` when a setting save needs user-visible
  acknowledgement or error reporting. Toast is the only acceptable channel.
- **SHOULD** stay silent on success when the UI already reflects the new
  state (e.g. a toggle that flipped, an avatar that re-rendered). Toast is for
  errors and for changes whose effect is not immediately visible.
- This rule is paired with [SPEC-073](./docs/specs/SPEC-073-settings-composition-layer.md)
  and applies to every Settings surface, including pages that have not yet
  migrated to the composition primitives.

---

## Testing Protocols

### Testing Framework

- **Unit Tests**: `node:test`
- **Integration Tests**: `node:test` with real HTTP server instances
- **E2E Tests**: Planned later when the browser UI exists

### Test Structure

```
tests/
├── unit/           # Unit tests (isolated, fast)
├── integration/    # Integration tests (with dependencies)
└── e2e/            # End-to-end tests (full system)
```

### Testing Rules

1. **Before Commit**: All unit tests must pass (`npm test` / `pytest` / `dotnet test`)
2. **Coverage Target**: Minimum 80% for stable domain modules
3. **Naming Convention**: `*.test.js` with clear scenario-oriented test names
4. **Mocking**: Prefer lightweight in-process stubs over heavy mocking frameworks
5. **CI Requirement**: All tests must pass before merge

### What to Test

| Layer | Test Type | Coverage |
|-------|-----------|----------|
| Domain/Core | Unit tests | High (90%+) |
| Application/Service | Unit + Integration | Medium (80%+) |
| Infrastructure | Integration | As needed |
| API/Controllers | Integration + E2E | Critical paths |

---

## Pull Request Guidelines

### PR Title Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

Examples:
feat(auth): add OAuth2 login support
fix(api): resolve null pointer in user endpoint
docs(readme): update installation instructions
```

### PR Checklist

Before submitting a PR, ensure:

- [ ] Code follows project coding conventions
- [ ] All tests pass locally
- [ ] New code has appropriate test coverage
- [ ] Documentation is updated (if applicable)
- [ ] No secrets or credentials in code
- [ ] PR title follows conventional commit format

### Review Process

1. **Self-review**: Author reviews their own changes first
2. **Peer review**: At least one approval required
3. **CI checks**: All automated checks must pass
4. **Merge**: Squash and merge (or your preferred strategy)

### PR Size Guidelines

- **Small PRs preferred**: Aim for < 400 lines changed
- **Single purpose**: One feature or fix per PR
- **Break large changes**: Split into smaller, reviewable chunks

---

## Script Standards

All scripts MUST include help documentation describing parameters and usage.

### PowerShell (.ps1)

Use comment-based help at the top of the script:

```powershell
<#
.SYNOPSIS
    Brief description of what the script does.

.DESCRIPTION
    Detailed description of the script's purpose and behavior.

.PARAMETER ParamName
    Description of the parameter.

.EXAMPLE
    .\Script-Name.ps1 -ParamName "value"
    Description of what this example does.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$ParamName
)
```

Users can view help with: `Get-Help .\Script-Name.ps1 -Full`

### Bash (.sh)

Include a usage function or header comments:

```bash
#!/bin/bash
#
# Script: script-name.sh
# Description: Brief description of what the script does.
#
# Usage: ./script-name.sh [OPTIONS] <ARGUMENTS>
#
# Options:
#   -h, --help     Show this help message
#   -v, --verbose  Enable verbose output
#
# Arguments:
#   <arg1>         Description of argument
#
# Examples:
#   ./script-name.sh -v "value"
#

usage() {
    echo "Usage: $0 [OPTIONS] <ARGUMENTS>"
    echo "  -h, --help     Show this help message"
    exit 1
}
```

---

## Agent Capabilities & Collaboration

### Project Roles

| Role | Assigned Agent | Responsibilities |
|------|----------------|------------------|
| **Conductor** | Unassigned | Orchestration, Planning, Status Tracking |
| **Architect** | Unassigned | System Design, Tech Stack Decisions |
| **Security Specialist** | Unassigned | Security Audits, Compliance, Vulnerability Management |
| **UX Lead** | Unassigned | User Experience, Frontend Standards |
| **Specialist** | All others | Implementation, Testing, Documentation |

> **Note**: Assign roles by filling in the "Assigned Agent" column.

### Capability Matrix

| Agent | Write Code | Review | Test | Docs |
|-------|------------|--------|------|------|
| Claude | Yes | Yes | Yes | Yes |
| Gemini | Yes | Yes | Yes | Yes |
| Codex | Yes | Yes | Yes | Yes |

### Collaboration Rules

1.  **Hierarchy Protocol**: If a Conductor is assigned in the **Project Roles** table, other agents MUST act as Specialists. Specialists MUST prioritize tasks assigned by the Conductor and MUST align all architectural decisions with the Conductor's plan. Specialists MUST NOT make independent architectural decisions without Conductor approval.
2.  **Task Assignment**: The Conductor assigns tasks via `docs/plans/` (using "Assigned To" field) or explicitly in conversation. Specialists MUST acknowledge task assignment before beginning work.
3.  **Status Tracking**: The Conductor is responsible for maintaining the "Current Status" section in `README.md` as the single source of truth for project progress. Other agents MUST NOT modify this section without Conductor approval.
4.  **Self-review prohibited**: An agent MUST NOT review code it wrote itself. This is a strict security requirement.
5.  **Cross-review recommended**: Important changes SHOULD be reviewed by a different agent when possible.
6.  **Documentation sync**: The agent modifying code is responsible for updating related docs. This MUST be done in the same session/PR.
7.  **File ownership**:
    *   Each agent MUST maintain ONLY its own specific file
    *   Claude maintains `CLAUDE.md` only
    *   Gemini maintains `GEMINI.md` only
    *   Codex maintains `CODEX.md` only
    *   All agents MAY update `AGENTS.md` but MUST provide clear justification in commit message
8.  **Parallel delivery ownership**:
    *   Product-local feature work SHOULD stay inside the owning product tree:
        `src/products/chat/**`, `src/products/work/**`, or `src/products/code/**`
    *   `src/app/server/**` is platform-host integration space and SHOULD converge
        through an integration owner rather than routine product feature edits
    *   The frozen shared-contract set MUST NOT be reshaped casually during
        product feature work; follow `docs/product-integration-guide.md`

### Handoff Protocol

When completing a task or handing off to another agent:

1. Use **git commit message** to record what was done (include agent name if relevant)
2. Clearly state what was done and what remains in conversation
3. Update `README.md` Current Status section if applicable

> **Note**: Do NOT add agent annotations in source code or documentation files.

### Conflict Resolution

- When agents disagree, ask the human for decision
- Document the decision in `docs/decisions/`

---

## Service & Port Management

### Port Registration Rules

1. **MUST** check `docs/services.md` to understand this project's port usage
2. **SHOULD** check the bootstrap project's `docs/port-registry.md` for cross-project port conflicts before assigning new ports
3. **MUST** update `docs/services.md` when adding or changing services that listen on ports
4. **SHOULD** update the bootstrap project's `docs/port-registry.md` when registering new ports
5. **MUST** warn the user if a port conflict is detected (do NOT treat as error)
6. **SHOULD** suggest the next available port when a conflict is found

### When Adding a New Service

1. Pick a port from the suggested ranges in `docs/port-registry.md`
2. Verify the port is not already in use by checking both `docs/services.md` and the central registry
3. Make the port configurable via an environment variable
4. Document the service in `docs/services.md`

---

## Security Guidelines

### Prohibited Actions

- Never commit secrets, API keys, or credentials
- Never execute `rm -rf /` or similar destructive commands
- Never modify files outside the project directory without explicit permission

### Sensitive Data Handling

- Use `.env` for secrets (never commit)
- Provide `.env.example` with placeholder values
- Check for accidental secret commits before pushing

---

## Documentation Standards

### Required Documents

**Root Level:**

| Document | Purpose |
|----------|---------|
| `PROGRESS.md` | Work packages and implementation status |
| `ROADMAP.md` | Long-term planning and milestones |

**In `docs/`:**

| Document | Purpose |
|----------|---------|
| `README.md` | Documentation index + expected documents list |
| `AGENT-GUIDE.md` | Agent-specific collaboration guide |
| `terminology.md` | AAIF/A2A/MCP terminology |
| `a2a/` | A2A agent card and task templates |
| `requirements.md` | Requirements specification |
| `architecture.md` | System architecture |
| `api.md` | API specification (REST/WebSocket/GraphQL) |
| `setup-guide.md` | Environment setup |
| `testing.md` | Testing strategy |
| `deployment.md` | Deployment instructions |
| `product-integration-guide.md` | Parallel product integration protocol |
| `security-guidelines.md` | Security policies |
| `SCRIPT-STANDARDS.md` | Script standards and naming conventions |
| `research/` | External research notes and sources |
| `specs/` | Feature specifications (SPEC-NNN-title.md) |
| `plans/` | Implementation plans (PLAN-NNN-title.md) |
| `decisions/` | Architecture Decision Records (ADR-NNN-title.md) |

### Document Creation

- Agents should create documents as needed
- Follow templates in `docs/`
- Update `docs/README.md` index when adding new documents

### Architecture Decision Records (ADR)

**Purpose**: Record important technical decisions so all agents understand *why* choices were made.

**When to create ADR**:
- Choosing a framework, library, or technology
- Making architectural decisions (patterns, structure)
- Any decision with multiple valid alternatives

**Rules for Agents**:
1. **Before making a decision**: Check `docs/decisions/` for existing relevant records
2. **After making a decision**: Create ADR in `docs/decisions/NNN-title.md`
3. **Numbering**: Use sequential numbers (001, 002, 003...)
4. **Template**: Follow `docs/decisions/000-template.md`

**Benefits**:
- Future agents understand past decisions without re-discussing
- Prevents conflicting suggestions from different agents
- Creates institutional memory across sessions

### Feature Specifications

**Purpose**: Define *what* to build before implementation begins.

**When to create Spec**:
- New features with multiple components
- Changes that affect multiple files or systems
- Features requiring user/stakeholder approval

**Rules for Agents**:
1. **Before implementing**: Create spec for complex features
2. **Location**: `docs/specs/SPEC-NNN-title.md`
3. **Numbering**: Use sequential numbers (001, 002, 003...)
4. **Template**: Follow `docs/specs/000-template.md`
5. **Review**: Get approval before proceeding to implementation

### Implementation Plans

**Purpose**: Define *how* to build a feature - actionable tasks and phases.

**When to create Plan**:
- After spec is approved
- For features requiring multiple implementation phases
- When coordinating work across multiple agents/developers

**Rules for Agents**:
1. **After spec approval**: Create implementation plan
2. **Location**: `docs/plans/PLAN-NNN-title.md`
3. **Link to spec**: Reference the related SPEC document
4. **Template**: Follow `docs/plans/000-template.md`
5. **Update progress**: Mark tasks complete as you work

---

## Git Conventions

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: resolve bug
docs: update documentation
refactor: restructure code
test: add tests
style: formatting changes
chore: maintenance tasks
```

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation
- `refactor/` - Refactoring

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.3 | 2026-04-22 | Add pre-release compatibility policy |
| 1.2.2 | 2026-03-25 | Refresh current product direction, parallel delivery rules, and product integration references |
| 1.2.1 | 2026-01-05 | Normalize compliance headings and template guidance |
| 1.2.0 | 2025-01 | Add Development Workflow overview, Feature Specifications, Implementation Plans (CDD support) |
| 1.1.0 | 2025-01 | Add Project Overview, Tech Stack, Coding Conventions, Testing Protocols, PR Guidelines (AAIF compliance) |
| 1.0.0 | 2025-01 | Initial framework |

---

*This file follows [AAIF AGENTS.md](https://agents.md) standard.*
