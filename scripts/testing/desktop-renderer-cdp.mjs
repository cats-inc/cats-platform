#!/usr/bin/env node
/** Inspect the installed Desktop renderer. Usage: node scripts/testing/desktop-renderer-cdp.mjs --help */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runRendererCdp } from '../shared/renderer-cdp.mjs';
export { parseArgs, selectPageTarget, listTargets, openCdpSession } from '../shared/renderer-cdp.mjs';
export const runDesktopRendererCdp = runRendererCdp;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runDesktopRendererCdp(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
