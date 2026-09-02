# Service Registry

> This file documents all services in this project that listen on network ports.
> Keeping this up to date helps avoid port conflicts and makes onboarding easier.

## Services

| Service Name | Port | Protocol | Description | Start Command |
|--------------|------|----------|-------------|---------------|
| `cats` HTTP app | 8181 | TCP | Product-facing app shell and health endpoints | `npm start` |
| `cats` Vite dev server | 5173 | TCP | Renderer development server with `/api` proxy | `npm run dev:web` |

The host repo/package target is now `cats-platform`, but the running local app
service names remain `cats` for product-facing and operational continuity.

## Planned Dynamic Port Ranges

| Service Name | Port Range | Protocol | Status | Description |
|--------------|------------|----------|--------|-------------|
| `Cats Code` live previews | 47100-47199 | TCP | Planned / disabled by default | Reserved candidate range for supervised loopback-only preview child processes under SPEC-108 / PLAN-097. No process spawning is enabled until the live-preview supervisor approval gate lands. |

## Planned Shared Service Boundaries

- `Cats Core v1` is a required shared contract for `Cats Chat` and
  `Cats Work`, but it does not have a dedicated network port yet. The current
  planning assumption is that it starts co-hosted inside the current local
  `cats-platform/` workspace until a stronger boundary is needed.
- `cats-runtime` remains the upstream runtime dependency for this project. Its
  direct API remains the primary app-facing boundary, while a future MCP facade
  is intended for orchestrator-style tool use rather than for general app
  routing.
- Do not assign a standalone `Cats Core` port until the implementation proves
  that co-hosting inside `cats` blocks team parallelism or packaging.

## Environment Variables

Port numbers should be configurable via environment variables so developers can override defaults when needed.

| Variable | Default | Service | Notes |
|----------|---------|---------|-------|
| `CATS_HOST` | `127.0.0.1` | `cats` HTTP app | Use `0.0.0.0` in containers; `CATS_INC_HOST` remains accepted temporarily |
| `CATS_PORT` | `8181` | `cats` HTTP app | Main local app port; `CATS_INC_PORT` remains accepted temporarily |
| `CATS_PLATFORM_DIR` | `~/.cats/platform` | Chat store | Base directory for product-owned platform storage under `state/` and `config/` |
| `CATS_DESKTOP_DIR` | `~/.cats/desktop` | Desktop host | Base directory for desktop host state and logs |
| `CATS_RUNTIME_DIR` | `~/.cats/runtime` | Runtime client | Base directory for runtime config, data, and sessions |
| `CATS_RUNTIME_BASE_URL` | `http://127.0.0.1:3110` | Runtime client | Points to `cats-runtime` |
| `CATS_RUNTIME_API_KEY` | empty | Runtime client | Optional bearer token for `cats-runtime` |
| `CATS_RUNTIME_SESSION_CREATE_TIMEOUT_MS` | `60000` | Runtime client | Timeout budget for runtime session creation and provider/workspace startup |
| `CATS_RUNTIME_SESSION_CREATE_SLOW_WARNING_MS` | `max(2000, budget / 6)` | Runtime client | Threshold above which a successful session create still emits a `slow_session_create` diagnostic record (see ADR-089) |
| `CATS_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS` | `120000` | Runtime client | Idle timeout for NDJSON message streams; reset whenever the runtime emits another chunk. Depends on the runtime keepalive contract documented in ADR-089 |
| `CATS_WORK_GOLDEN_PATH_ENABLED` | `false` | Telegram work delivery | Enables the SPEC-114 `/work` golden path; disabled by default. Turning it off is the rollback: Core and transport records survive and `/work` reverts to ordinary chat routing |
| `CATS_WORK_GOLDEN_PATH_OWNERS` | empty | Telegram work delivery | Comma-separated Telegram user ids allowed to delegate work (SPEC-114 FR-1). Empty means nobody is authorized and the bot says so; there is no trust-on-first-use path |
| `CATS_WORK_GOLDEN_PATH_WORKSPACE` | empty | Telegram work delivery | Absolute workspace the first slice executes against. Unset reports `workspace_missing` readiness rather than guessing |
| `CATS_CODE_LIVE_PREVIEW_ENABLED` | `false` | Cats Code live preview | Enables the supervised live-preview substrate after PLAN-097 approval; disabled by default |
| `CATS_CODE_LIVE_PREVIEW_USE_REAL_PROCESS_ADAPTER` | `false` | Cats Code live preview | Switches the supervisor from the inert adapter to the real `child_process.spawn` adapter; only takes effect when `_ENABLED` is also true and an approved profile is registered |
| `CATS_CODE_LIVE_PREVIEW_PORT_RANGE` | `47100-47199` | Cats Code live preview | Candidate loopback port range for supervised preview child processes |
| `CATS_CODE_LIVE_PREVIEW_MAX_GLOBAL` | `3` | Cats Code live preview | Global concurrent live-preview lease limit |
| `CATS_CODE_LIVE_PREVIEW_MAX_PER_WORKSPACE` | `1` | Cats Code live preview | Per-workspace concurrent live-preview lease limit |
| `CATS_CODE_LIVE_PREVIEW_LEASE_TTL_MS` | `1800000` | Cats Code live preview | Default live-preview lease TTL |
| `CATS_CODE_LIVE_PREVIEW_LOG_MAX_BYTES` | `1048576` | Cats Code live preview | Bounded stdout/stderr capture size per preview |
| `CATS_CODE_LIVE_PREVIEW_ALLOW_IPV6_LOOPBACK` | `false` | Cats Code live preview | Allows `[::1]` leases when explicitly enabled |
| `CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES` | `[]` | Cats Code live preview | JSON array of declarative command profiles; assistants cannot provide raw shell commands |

## Telegram work delegation: rollout, rollback, and the offline limit

### Rollout

Work delegation over Telegram is **off by default** and gated twice:

- `CATS_WORK_GOLDEN_PATH_ENABLED` must be `true`, and
- `CATS_WORK_GOLDEN_PATH_OWNERS` must name the Telegram user ids allowed to
  delegate. Empty means nobody is authorized. There is deliberately no
  trust-on-first-use path into a workspace, so the owner cohort is exactly the
  list, and widening it is an explicit config change.

Before widening the cohort, read `GET /api/work/delivery-telemetry`. It reports
bounded counters — readiness failures, dedupe hits, admission results, run
terminal states, outbox retries, delivery receipts, and bucketed decision
latency — and carries no message bodies, chat ids, or credentials by
construction: counter labels come from a closed set and anything else is
refused rather than recorded.

### Rollback

Setting `CATS_WORK_GOLDEN_PATH_ENABLED=false` is the rollback. The host then
composes no golden path at all, so:

- `/work` reverts to ordinary Cats Chat routing;
- golden-path inline callbacks are no longer claimed; and
- **every Core and transport record survives** — Work Items, Tasks, Runs,
  approvals, outcomes, activities, and delivery receipts are all retained, which
  is what makes a post-incident review possible.

No data migration is involved in either direction.

Opaque action grants and outbound delivery intents/receipts live in
`<platform-state-dir>/transport-work-delivery.json`, written atomically with
owner-only file permissions. Startup automatically sends rows that were still
plain `pending`. A row found in `sending` has an unknowable Telegram outcome,
so it becomes `ambiguous` and is never sent again until the owner explicitly
chooses Retry; this prefers a visible possible duplicate over a silent automatic
duplicate.

### The host-offline limit

This is a local-first path: work executes on the machine running Cats Desktop.
When that host is asleep or stopped, **Telegram gets no reply at all** — not a
"host offline" message. That is a property of the design, not an oversight: the
process that would answer is the process that is not running.

Telegram queues updates for a bounded period, so a `/work` message sent while
the host was asleep is normally processed when it wakes. A message older than
Telegram's own retention is lost, and Cats cannot know it existed.

The readiness evaluator does carry a `background_service_unavailable` blocker,
and it is reported on the Desktop settings surface (`/settings/work`). It is
effectively unreachable *from Telegram* for the reason above: if the resolver is
running, the background service is up. Do not read its absence from a `/status`
reply as proof the host has been up continuously.

## Cross-Project Port Coordination

This project was created from **project-bootstrap**, which maintains a central port registry at:

```
<bootstrap-project>/docs/port-registry.md
```

**For AI agents**: When adding or changing a service port in this project:

1. **MUST** update the **Services** table above
2. **SHOULD** check the bootstrap project's `docs/port-registry.md` for conflicts with other projects
3. **SHOULD** register the new port in the bootstrap project's `docs/port-registry.md`
4. **MUST** warn the user if a port conflict is detected

---

*Last updated: 2026-05-09*
