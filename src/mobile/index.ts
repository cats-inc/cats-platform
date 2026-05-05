/**
 * Mobile-safe entry point for the React Native client.
 *
 * Anything exported from here MUST be safe to import from the mobile
 * codebase under `cats-platform/mobile/`. That means:
 *
 *   - no `node:*` imports (or transitive imports of them)
 *   - no `fs` / `path` / `crypto` / `os` / `child_process` imports
 *   - no imports from `src/server/`, `src/desktop/`, `src/app/server/`,
 *     `src/runtime/`, or any other Node-tied module
 *   - no imports of `src/shared/guideCatAssist*` (the canonical example
 *     of a transitive Node leak via `node:crypto`)
 *
 * Direct-import compliance is checked by `scripts/check-mobile-boundary.mjs`.
 * Transitive compliance is verified by running the mobile workspace's
 * `npm run typecheck` against this boundary.
 *
 * Allowed exports:
 *
 *   - DTO / API response types (`contracts.ts`)
 *   - Pure functions (`messageBody.ts` segmenter, `chat.ts` selectors)
 *   - Mobile read-model selectors (pure projections over the live read
 *     model)
 *
 * Per the 2026-04-29 integrator review: this is the boundary slice that
 * unblocks PLAN-084 Phases 4b / 4c and the Phase 5 product modal port.
 * Resist the temptation to re-export the whole `workspaceContracts`
 * tree from here — every new export must be reviewed for its transitive
 * import surface.
 */

export * from './messageBody.js';
export * from './contracts.js';
export * from './chat.js';
export * from './messages.js';
export * from './i18n.js';
export * from './catsDirectory.js';
