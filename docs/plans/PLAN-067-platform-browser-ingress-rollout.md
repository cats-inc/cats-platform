# PLAN-067: Platform Browser Ingress Rollout

> Roll out trusted LAN browser access first, then leave a clean follow-through
> path for optional tunnel/overlay access, while keeping `cats-runtime` behind
> the platform host and preserving the packaged Electron sidecar topology.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-075: Platform Browser Ingress for LAN and Tunneled Access](../specs/SPEC-075-platform-browser-ingress-for-lan-and-tunneled-access.md)

## Overview

Phase 1 lands the browser-ingress boundary: `cats-platform` serves runtime
surfaces under `/runtime/*`, proxies runtime APIs under `/runtime/api/*`, and
adds the minimum dev-host ergonomics needed for LAN testing without changing
packaged Electron defaults.

Phase 2 does not expose the runtime directly. It adds deployment guidance and,
only if later needed, small platform-host settings for trusted tunnel/overlay
entrypoints such as Tailscale or ngrok.

## Implementation Phases

### Phase 1A: Host-Owned Runtime Surface Seam

- [x] Task 1.1: Create ADR / SPEC / PLAN for the LAN + tunnel phased ingress model.
- [x] Task 1.2: Replace `/runtime/setup` redirect behavior with a platform-owned runtime-surface adapter.
- [x] Task 1.3: Add `/runtime/api/*` reverse proxy support with header forwarding and stream-safe passthrough.
- [x] Task 1.4: Add first integration coverage for platform-hosted runtime surfaces and runtime API proxying.

**Deliverables**: Runtime setup/dashboard/playground and runtime APIs can be
reached from the platform origin without sending the browser directly to the
runtime origin.

### Phase 1B: Trusted LAN Dev Ergonomics

- [x] Task 2.1: Make Vite dev/preview host settings configurable for LAN testing.
- [x] Task 2.2: Add env examples and setup guidance that separate dev/self-hosted LAN binds from packaged desktop loopback defaults.
- [ ] Task 2.3: Manually verify local-IP access from a second device on the same LAN.

**Deliverables**: Dev/self-hosted web can opt into LAN-visible hosting without
changing packaged Electron behavior.

### Phase 2: Trusted Tunnel / Overlay Follow-Through

- [ ] Task 3.1: Document the Tailscale/ngrok deployment shape with `cats-platform` as the only ingress target.
- [ ] Task 3.2: Decide whether a platform-owned external base URL setting is required for absolute links or webhook-facing flows.
- [ ] Task 3.3: Add tunnel-mode diagnostics or helpers only if a concrete operator workflow needs them.

**Deliverables**: Remote access planning exists without coupling tunnel behavior
to the runtime or changing desktop defaults.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/decisions/074-*.md` | Create | Ingress boundary ADR |
| `docs/specs/SPEC-075-*.md` | Create | Two-phase feature spec |
| `docs/plans/PLAN-067-*.md` | Create | Rollout plan |
| `src/app/server/requestRouter.ts` | Modify | Route `/runtime/*` and `/runtime/api/*` through the platform host |
| `src/app/server/runtimeSurfaceProxy.ts` | Create | Runtime HTML adaptation + reverse proxy helpers |
| `vite.config.ts` | Modify | LAN-friendly dev/preview host configuration |
| `.env.example` | Modify | Dev LAN vs desktop loopback guidance |
| `docs/setup-guide.md` | Modify | Document local-IP development workflow |
| `tests/provider-telegram-routes.test.js` | Modify | Update `/runtime/setup` expectation |
| `tests/runtime-surface-routes.test.js` | Create | Focused runtime-surface routing coverage |

## Technical Decisions

- Keep browser ingress at `cats-platform`; do not expose `cats-runtime` directly.
- Adapt runtime HTML at the host boundary instead of rewriting runtime pages
  into React surfaces.
- Keep packaged Electron loopback-only through desktop-specific env separation.
- Treat tunnel/overlay support as a later host concern, not as a reason to move
  ingress into the runtime.

## Testing Strategy

- **Unit Tests**: Focused routing/proxy tests for `/runtime/*` and
  `/runtime/api/*`.
- **Integration Tests**: Server-level tests with a stub runtime upstream,
  including HTML hosting, JSON proxying, and stream passthrough.
- **Manual Testing**: Open the app by local IP from another device in phase 1B;
  later validate a Tailscale/ngrok path in phase 2.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Runtime pages still assume runtime-origin paths | High | Inject a host-owned fetch/EventSource/path adapter before page scripts run |
| Dev LAN changes leak into packaged Electron behavior | High | Keep desktop host env overrides explicit and loopback-only by default |
| Tunnel planning grows into premature public-ingress work | Medium | Keep phase 2 documentation-first until a concrete operator need appears |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-20 | Plan created from the new LAN + tunnel browser-ingress direction |
| 2026-04-20 | Phase 1A routing foundation and phase 1B dev-host env slice landed; manual second-device verification still pending |

---

*Created: 2026-04-20*
*Author: Codex*
