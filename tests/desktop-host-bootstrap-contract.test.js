import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function readDesktopHostMain() {
  return await readFile(path.join(process.cwd(), 'desktop', 'host', 'main.ts'), 'utf8');
}

test('desktop host bounds fresh-start CLI inventory scans without failing pending bootstrap', async () => {
  const source = await readDesktopHostMain();

  assert.match(source, /const RUNTIME_BOOTSTRAP_SETUP_SCAN_TIMEOUT_MS = 8_000;/);
  assert.match(source, /const BACKGROUND_CLI_SCAN_BACKOFF_MS = \[2_000, 4_000\];/);
  assert.match(source, /const RUNTIME_CLI_INVENTORY_POLL_INTERVAL_MS = 2_000;/);
  assert.match(
    source,
    /scanTimeoutMs: setupCompleted\s*\?\s*RUNTIME_SETUP_SCAN_TIMEOUT_MS\s*:\s*RUNTIME_BOOTSTRAP_SETUP_SCAN_TIMEOUT_MS/u,
  );
  assert.match(source, /function createCliInventoryScanFailedError\(\)/);
  assert.match(source, /function clearCliInventoryError\(\)/);
  assert.match(source, /function scheduleRuntimeCliInventoryPoll\(/);
  assert.match(source, /async function pollRuntimeCliInventory\(/);
  assert.match(source, /await maybeOpenApp\(snapshot\);/);
  assert.match(source, /actionId === 'retry_cli_scan'/);
  assert.match(source, /retryCliScanPromise \?\?= runRetryCliScanAction\(\)/);
  assert.match(source, /shouldRefreshCliInventoryAfterSetupAction\(action\.helperId\)/);
  assert.match(source, /triggerScanIfMissing: false,/);
  assert.match(
    source,
    /!options\.setupCompleted && latestSnapshot && isDesktopBootstrapLoadingPhase\(latestSnapshot\.phase\)/u,
  );
  assert.match(
    source,
    /scheduleRuntimeCliInventoryPoll\(\{\s*setupCompleted: options\.setupCompleted,\s*\}\);/u,
  );
  assert.doesNotMatch(
    source,
    /if \(!options\.setupCompleted && latestSnapshot && isDesktopBootstrapLoadingPhase\(latestSnapshot\.phase\)\) \{\s*latestCliInventoryError = createCliInventoryScanFailedError\(\);/u,
  );
});

test('desktop host keeps setup audit as background enrichment only', async () => {
  const source = await readDesktopHostMain();

  assert.match(source, /function scheduleBackgroundSetupAudit\(/);
  assert.match(
    source,
    /if \(isDesktopBootstrapLoadingPhase\(snapshot\.phase\) \|\| backgroundSetupAuditPromise\)/u,
  );
  assert.match(source, /publishMode: 'bootstrap-only'/);
  assert.match(source, /refreshBootstrap: false/);
  assert.match(
    source,
    /const shouldPublish = options\.publishMode !== 'bootstrap-only' \|\| bootstrapPageVisible;/u,
  );
});
