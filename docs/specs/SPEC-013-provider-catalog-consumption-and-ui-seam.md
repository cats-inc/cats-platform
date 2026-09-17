# SPEC-013: Provider Catalog Consumption and Truthful Selector UI Seam

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Revised direction; picker continuity amendment accepted and implemented 2026-09-18 |
| **Owner** | Codex |
| **Reviewer** | User / provider-catalog workstream |

## Summary

`cats-platform` should stop mixing three different concepts in one dropdown:

- product-supported provider catalogs
- runtime-configured provider topology
- execution targets that are truly usable right now

Setup and in-product provider/model selectors must consume a truthful
runtime-backed selector contract. If the runtime has no usable target, the UI
must say so explicitly instead of filling the picker with static fallback
catalog entries.

Product-supported catalogs may still exist for documentation, recommendations,
or future settings surfaces, but they are not valid execution pickers.

## Goals

- expose a stable product API for truthful execution-target selectors
- keep the renderer off direct `cats-runtime` HTTP calls
- reuse the same selector contract in setup and in-product target pickers
- keep truthful selector reads fast enough for setup and in-product composer use
- preserve a separate place for informational product-supported catalogs when
  needed
- stop static fallback behavior from leaking into execution selection UI

## Non-Goals

- making `cats-platform` the owner of runtime discovery or provider health
- requiring the renderer to call `cats-runtime` directly
- redesigning the dedicated Runtime settings/diagnostics surfaces
- preventing informational provider catalogs from existing elsewhere in the
  product
- solving every future provider-management screen in this one spec

## User Stories

- As a setup user, I want the Guide Cat provider/model picker to show only
  choices that can actually be used right now.
- As a product user, I want later provider/model selectors to follow the same
  rule instead of showing theoretical or broken options.
- As a product server, I want a runtime-backed selector contract that tells me
  whether usable targets exist, rather than forcing me to guess from fallback
  catalogs.
- As a maintainer, I want product-supported catalogs and runtime-usable
  execution choices to stay separate so the UX stays honest.

## Requirements

### Functional Requirements

1. `cats-platform` shall expose a product-owned selector API used by setup and
   in-product provider/model execution pickers.
2. That selector API shall return Runtime-observed targets bounded by current
   selection. Retained observations during recovery carry freshness warnings;
   they do not authorize execution. Product-catalog-only providers are not
   selectable execution options.
3. When the runtime is reachable but no usable targets exist, the selector API
   shall return an explicit machine-readable state such as
   `no_usable_targets`, not an empty success with fallback catalog entries.
4. When the runtime is unreachable, the selector API shall return an explicit
   machine-readable state such as `runtime_unreachable`, not a fake usable
   provider list.
5. Selector responses may include provider family, backend, default instance,
   instance list, default model hint, model-catalog provenance, and warnings,
   for usable targets or retained Runtime observations during recovery.
6. `cats-platform` shall keep the renderer off direct `cats-runtime` calls.
7. `GET /api/providers/{provider}/models` and
   `GET /api/providers/{provider}/models/advanced` when used by execution
   selectors shall only proxy runtime catalogs for resolved usable targets.
8. Product execution selectors shall not fall back to curated static model
   lists when runtime lookup fails. They retain previously observed runtime
   data and recover automatically under the picker continuity contract below.
9. When the runtime only has a trustworthy default-model hint for a usable
   target, selector UI shall present that default or `Provider default`; it
   shall not invent a larger hardcoded model list.
10. Unknown providers or invalid selector context shall return a client error
    instead of silently fabricating options.
11. `cats-platform` may keep a separate informational provider-catalog route or
    read model for documentation, recommendation, or install guidance, but that
    surface shall not be reused as an execution picker.
12. Setup and in-product execution pickers shall share one renderer seam and
    one product API contract so truthfulness does not drift by surface.
13. `cats-platform` may keep a short-lived server-side cache for selector read
    models and may dedupe concurrent selector reads, but cached results shall
    still originate from runtime-owned truth rather than product static
    fallback catalogs.
14. Selector read paths shall prefer a bounded runtime bulk-availability read
    model when `cats-runtime` already exposes one, rather than rebuilding
    selector truth through per-provider availability fan-out on the hot path.
15. `GET /api/providers/{provider}/models` and
    `GET /api/providers/{provider}/models/advanced` shall not trigger a fresh
    full provider-registry rebuild for every request. They shall reuse already
    established truthful selector state, a short-lived selector cache, or a
    comparably bounded usable-target check.
16. Setup shall not fetch truthful selector state unless the owner has opted
    into Guide Cat creation for that render path.
17. The selector hot path shall not depend on a full diagnostics payload when
    it only needs usable-target availability truth. The current runtime
    diagnostics payload still bundles retained-artifact reads, full config
    inspection, metering, and operator-facing detail, so the cross-project
    contract should add a lighter availability-only scope or equivalent
    selector-oriented read model.
18. Selector-specific runtime reads may use a dedicated timeout tuned for bulk
    truthful availability reads. That timeout should reflect the chosen runtime
    scope rather than inherit a per-target probing budget blindly.

### Picker continuity contract (accepted 2026-09-18)

This amendment governs every shared provider/model picker, including setup,
Settings Brain cards and Chat. It supersedes earlier instructions to display
transport warnings or manual recovery actions inside execution pickers.

- **MUST** render the last successful Runtime-backed provider/model data
  immediately on reopen, including after prolonged tray idle. TTL controls
  refresh frequency; it must not delete that session's last successful data.
- **MUST** preserve independently successful base/advanced model catalogs when
  the other request fails. A refresh failure must not replace them with static
  product catalogs, an empty list, or a different selected model.
- **MUST** show an animated, accessible loading indicator while initial reads
  or recovery are pending. Transient failures keep recovery active until data
  arrives, without requiring a click. A successful authoritative empty result
  can show the ordinary empty state and continue bounded availability polling.
- **MUST NOT** render raw transport/timeout/auth error strings, a Retry button,
  or an Open Cats Runtime Setup button in the picker or its surrounding setup
  or Brain card. Dedicated environment settings retain their existing role.
- **MUST** coalesce shared reads, avoid overlapping retry attempts, apply a
  bounded delay/backoff, pause retries while hidden, resume on visibility/focus,
  and cancel timers/listeners and reject late results after unmount/target change.
- First setup step 2's optional prefetch **MUST** contain rejected reads. The
  mounted Catlas picker owns retry; prefetch must not create an unhandled error,
  duplicate recovery UI, or fetch catalogs before the user enables Catlas.
- **MUST** invalidate retained data on a confirmed selection revision change or
  explicit connection/auth reset. Unknown revision during transient failure is
  not evidence of deselection. Server catalog and execution requests still
  verify the current Runtime selection; retained UI data cannot widen ROI.
- **MUST** cover long idle, consecutive failures then automatic success,
  partial catalog success, hidden/resumed/unmounted pickers, and selection
  invalidation with regression tests. Do not restore click-to-recover behavior
  when fixing other selector issues.

### Non-Functional Requirements

- **Truthfulness**: execution pickers retain observed data while recovering;
  they never invent static options or treat a cached display as execution authority
- **Boundary ownership**: runtime discovery and availability remain inside
  `cats-runtime`
- **Consistency**: setup and in-product selectors must tell the same story
- **Graceful recovery**: selector routes should return explicit recovery states
  rather than forcing the UI to infer them from generic transport failures
- **Latency discipline**: selector cache-hit reads should avoid a new runtime
  registry fan-out, and cache-miss reads should stay bounded to a topology read
  plus one bulk availability read rather than N sequential provider probes
- **Concurrency discipline**: repeated selector mounts in one product session
  should coalesce onto shared runtime-backed reads instead of stampeding the
  same truth endpoints
- **Cross-layer complementarity**: the product's short-lived selector cache
  should cover repeated mount/reopen churn and complement the runtime's
  existing compatibility cache plus any later selector-oriented runtime cache,
  while the last successful display remains available until authoritative
  selection/session invalidation or a newer successful result

## API Shape

### `GET /api/providers`

For execution-selector usage, this route should behave like a truthful selector
read model, not a generic product catalog.

Illustrative response when usable targets exist:

```json
{
  "state": "ready",
  "providers": [
    {
      "id": "claude",
      "label": "Claude",
      "defaultModel": "claude-sonnet-4-6",
      "defaultInstance": "native",
      "defaultBackend": "cli",
      "instances": [
        {
          "id": "native",
          "label": "cli/native",
          "target": "cli/native",
          "backend": "cli",
          "default": true
        }
      ],
      "modelsPath": "/api/providers/claude/models"
    }
  ]
}
```

The product may attach additive freshness metadata for diagnostics or
instrumentation, but the selector payload itself must remain runtime-backed:

- cache metadata, when present, describes reuse of a recent runtime truth
  snapshot
- cache reuse is an optimization, not permission to synthesize providers or
  models that the runtime did not report
- recovery metadata is for automatic recovery and diagnostic consumers; it
  does not authorize Retry or Runtime Setup actions inside pickers

Selector-oriented runtime follow-through for this route:

- `cats-platform` should consume one runtime topology read plus one runtime
  availability-only bulk read
- the intended runtime-side minimal path is additive rather than a new endpoint:
  extend `GET /diagnostics/providers` with something like
  `scope=availability`
- that availability scope should reuse the existing
  `collectProviderDiagnostics(..., { includeArtifacts: false })` seam rather
  than invent a second diagnostics pipeline
- it may keep cheap top-level route metadata such as `probe` and aggregated
  `summary` so callers do not lose zero-cost context they already get from the
  diagnostics surface
- that availability scope should return only the fields the selector needs:
  `provider`, `backend`, `instance`, `defaultTarget`, and `availability`
- it should omit operator/detail fields the selector does not consume:
  `config`, `checks`, `setup`, `compatibility`, `metering`,
  `compatibilityEvidence`, `providerEvolution`, and `reprobe`

Illustrative runtime-side availability-only response shape:

```json
{
  "probe": "light",
  "summary": {
    "status": "degraded",
    "totals": {
      "providers": 3,
      "ok": 2,
      "degraded": 1,
      "unavailable": 0
    }
  },
  "providers": [
    {
      "provider": "claude",
      "backend": "cli",
      "instance": "native",
      "defaultTarget": true,
      "availability": {
        "status": "ok",
        "summary": "Ready",
        "checkedAt": "2026-04-08T09:00:00.000Z"
      }
    },
    {
      "provider": "gemini",
      "backend": "cli",
      "instance": "wsl",
      "defaultTarget": false,
      "availability": {
        "status": "degraded",
        "summary": "Authentication required",
        "checkedAt": "2026-04-08T09:00:01.000Z"
      }
    }
  ]
}
```

Illustrative response when runtime is reachable but no usable targets exist:

```json
{
  "state": "no_usable_targets",
  "providers": [],
  "recovery": {
    "openRuntimeSetupPath": "/runtime/setup"
  }
}
```

Illustrative response when runtime is unreachable:

```json
{
  "state": "runtime_unreachable",
  "providers": [],
  "recovery": {
    "retryable": true
  }
}
```

### `GET /api/providers/{provider}/models`

Illustrative response:

```json
{
  "catalog": {
    "provider": "claude",
    "backend": "cli",
    "instance": "native",
    "defaultModel": "claude-sonnet-4-6",
    "source": "dynamic",
    "cache": {
      "servedFromCache": true,
      "cachedAt": "2026-04-07T10:00:00.000Z",
      "ttlSec": 60
    },
    "models": [
      { "id": "claude-sonnet-4-6", "label": "sonnet 4.6", "default": true }
    ],
    "warnings": []
  }
}
```

Selector-specific notes:

- this route is only valid after the product has already established that the
  target is currently usable
- `source` tells the caller where the model metadata came from, not whether the
  target is healthy on its own
- when lookup fails, API callers receive an explicit error/recovery state;
  pickers retain observed data and automatically recover under the continuity
  contract, without rendering the raw error or static fallback options

## Design Notes

- Product-supported provider catalogs and runtime-usable execution targets are
  different read models and must remain separate.
- The product server may compose runtime availability plus runtime model
  catalog reads, but the renderer should not.
- When `cats-runtime` already exposes bulk provider availability truth, the
  product should favor one topology read plus one bulk availability read over
  per-provider availability fan-out.
- When the runtime's existing diagnostics surface is still too heavy for
  selector hot paths, the product/runtime contract should evolve toward an
  availability-only scope that omits retained-artifact reads and other
  operator-facing decoration the selector does not consume.
- The product server may keep a short-lived truthful selector snapshot cache,
  plus in-flight request dedupe, so repeated setup/product mounts do not
  re-fetch the same provider registry on every reopen.
- Freshness deadlines schedule revalidation. The last successful Runtime
  observation remains available during transient failures, regardless of idle
  duration, until a newer authoritative result or selection/session invalidation.
  It must not become product-owned static fallback or execution authority.
- Model and advanced-model selector routes should reuse truthful selector state
  rather than revalidating the entire provider registry before every catalog
  fetch when the selected provider was already established as usable.
- If the current `GET /api/providers` route name is kept, its selector usage
  semantics must be updated to match this spec. If that route name becomes too
  overloaded, a dedicated selector endpoint is acceptable.
- Setup and in-product selector UIs should reuse one extracted renderer seam so
  a fallback fix in one place benefits the other.

## Dependencies

- [cats-runtime SPEC-004](../../../cats-runtime/docs/specs/SPEC-004-provider-model-catalog-and-discovery.md)
- [cats-runtime SPEC-023](../../../cats-runtime/docs/specs/SPEC-023-verified-advanced-provider-catalogs-and-manual-refresh-discovery.md)
- [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [PLAN-040](../plans/PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)

## Picker continuity implementation and validation (2026-09-18)

The renderer now separates display retention from refresh freshness. Registry
and model clients coalesce requests, reject superseded results, and clear data
on confirmed selection changes, logout or current-session 401/403 responses.
Base and advanced catalogs recover independently. Reads use a 30-second request
deadline, retry after 2/4/8/16/30 seconds with a 30-second cap, and stop scheduling
while hidden or unmounted. Successful registry and model reads refresh on
30-second and 60-second visible schedules respectively.

Server caches retain the last successful observation beyond the old ten-minute
deadline while checking current selection on every request. An authoritative
empty result replaces prior choices; incomplete or failed topology reads remain
transient failures. Existing server backoff still bounds Runtime work.

Validation on Windows:

- Scoped client/component tests cover 24-hour idle, consecutive failures,
  partial success, empty/custom catalogs, stale refresh markers, auth/revision
  invalidation, late responses, hidden/resumed reads and cleanup.
- First setup follow-up renders the actual wizard, advances from owner details
  to Catlas opt-in, and exercises 401/403 followed by registry/model timeouts.
  It verifies automatic recovery, no inline error or recovery actions, coalesced
  prefetch, and stopped reads after opt-out. The initial test reproduced an
  unhandled prefetch rejection; the wizard now contains that failure while the
  shared picker retries. Server regression coverage separately verifies catalog
  reads before first-admin creation and authenticated access after completion.
  The follow-up's 43 scoped checks and test TypeScript check pass; one unrelated
  assist-cache timing case timed out during the initial concurrent typecheck and
  passed when rerun on its own.
- Provider routes/bootstrap/snapshot/Telegram suites and architecture,
  browser-ingress, renderer-boundary and test-collection checks pass.
- Server/web builds and test TypeScript checking pass. No full local test run
  was performed; required PR CI remains the full-suite gate.
- An isolated hidden Electron fixture with a temporary profile verified the
  Chinese picker: timeout shows an animated spinner without error/actions,
  then mocked recovery fills Grok/Grok 4.6 automatically with no overflow or
  renderer errors. It did not access the user's persisted data. This is not a
  packaged Windows/macOS/Linux smoke run, and no preview was published.

## Open Questions

- [ ] Keep `GET /api/providers` as the selector route name, or introduce a new
      dedicated selector endpoint to avoid overloading the old catalog meaning?
- [ ] Which non-execution product surfaces still need a separate informational
      provider catalog, and should that be a new route or static server-owned
      data?
- [x] Picker recovery hides transport warnings and uses accessible loading
      indicators with automatic retry; diagnostic metadata remains available
      to dedicated settings/diagnostic consumers.

## References

- [ADR-008](../decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [PLAN-040](../plans/PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)
- [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)

---

*Created: 2026-03-19*
*Revised: 2026-09-18*
*Author: Codex*
