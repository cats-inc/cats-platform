import type { PlatformBuildChannel } from './platform-contract.js';

/**
 * Build channel baked into the cats-platform source. This file ships as
 * `'development'` by default; staging and installer scripts overwrite it
 * (Slice 4 of PLAN-077) before tsc/esbuild compile so packaged desktop
 * artifacts and the bundled app-sidecar server emit `'production'`.
 *
 * The plan forbids deriving the channel from `NODE_ENV`,
 * `import.meta.env.DEV`, command-line input, persisted flag state, or
 * renderer-provided data — every read path goes through this constant so
 * the production guard cannot be defeated by patching runtime state.
 */
export const BUILD_CHANNEL: PlatformBuildChannel = 'development';
