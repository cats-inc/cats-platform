/**
 * Desktop's delegation-readiness surface (SPEC-114 FR-3, PLAN-105 gate G1).
 *
 * The bot tells the owner why a `/work` request was refused; Desktop is where
 * the prerequisites are actually fixed. Two things have to hold for that to be
 * worth anything: the two surfaces must not evaluate the rules separately, and
 * a blocker's remediation link must point at a page that exists.
 *
 * The second is not hypothetical. Before this surface existed the remediation
 * paths named `/settings/cats/telegram`, `/settings/providers`, and
 * `/work/projects` — two of which were not routes at all, so following the
 * "fix this" link landed on the settings not-found page.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ServerResponse } from 'node:http';
import test from 'node:test';

import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import { TRANSPORT_WORK_READINESS_REASONS } from '../src/platform/transports/work-delivery/contracts.js';
import { routeWorkApi } from '../src/products/work/api/index.js';
import { WORK_API_DELIVERY_READINESS_PATH } from '../src/products/work/shared/apiPaths.js';
import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';

// --- Remediation links must resolve --------------------------------------------

/** Every `path="..."` mounted under `/settings`. */
function readSettingsRoutes(): Set<string> {
  const source = readFileSync('src/app/renderer/settings/PlatformSettingsRoutes.tsx', 'utf8');
  const routes = new Set<string>();
  for (const match of source.matchAll(/path="([^"]+)"/gu)) {
    routes.add(`/settings/${match[1].replace(/\/\*$/u, '')}`);
  }
  return routes;
}

test('every readiness blocker links to a settings page that exists', () => {
  const settingsRoutes = readSettingsRoutes();
  assert.ok(settingsRoutes.size > 0, 'the route table was parsed');

  // Force every reason to fire at once.
  const readiness = evaluateTransportWorkReadiness({
    bindingEnabled: false,
    bindingHealthy: false,
    ownerAuthorized: false,
    boundCatId: null,
    executionTargetId: null,
    capabilityProfileResolved: false,
    workspacePath: null,
    permission: { toolScope: 'none', sufficient: false, reasons: ['workspace_not_configured'] },
    deliveryMode: null,
    deliveryGates: null,
    backgroundServiceAvailable: false,
  });

  for (const blocker of readiness.blockers) {
    assert.ok(
      blocker.remediationPath,
      `${blocker.reason} has no remediation path, so Desktop cannot offer a fix`,
    );
    assert.ok(
      settingsRoutes.has(blocker.remediationPath),
      `${blocker.reason} links to ${blocker.remediationPath}, which is not a settings route`,
    );
  }
});

test('every declared reason is reachable from the evaluator', () => {
  // A reason code with no way to produce it is copy nobody will ever read.
  const produced = new Set<string>();
  const bases = [
    {
      permission: {
        toolScope: 'none' as const,
        sufficient: false,
        reasons: ['workspace_not_configured' as const],
      },
    },
    {
      permission: {
        toolScope: 'none' as const,
        sufficient: false,
        reasons: ['workspace_unreachable' as const],
      },
    },
    {
      permission: {
        toolScope: 'read_only' as const,
        sufficient: false,
        reasons: ['workspace_not_a_repository' as const],
      },
    },
    {
      permission: {
        toolScope: 'read_only' as const,
        sufficient: false,
        reasons: ['workspace_not_clean' as const],
      },
    },
  ];
  for (const base of bases) {
    const readiness = evaluateTransportWorkReadiness({
      bindingEnabled: false,
      bindingHealthy: false,
      ownerAuthorized: false,
      boundCatId: null,
      executionTargetId: null,
      capabilityProfileResolved: false,
      workspacePath: null,
      deliveryMode: null,
      deliveryGates: null,
      backgroundServiceAvailable: false,
      ...base,
    });
    for (const blocker of readiness.blockers) {
      produced.add(blocker.reason);
    }
  }
  // `binding_unhealthy` only fires for an *enabled* binding, so it needs its own case.
  const unhealthy = evaluateTransportWorkReadiness({
    bindingEnabled: true,
    bindingHealthy: false,
    ownerAuthorized: true,
    boundCatId: 'cat-1',
    executionTargetId: 'claude:opus',
    capabilityProfileResolved: true,
    workspacePath: '/repo',
    permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
    deliveryMode: 'commit_only',
    deliveryGates: [],
    backgroundServiceAvailable: true,
  });
  for (const blocker of unhealthy.blockers) {
    produced.add(blocker.reason);
  }

  assert.deepEqual(
    [...produced].sort(),
    [...TRANSPORT_WORK_READINESS_REASONS].sort(),
  );
});

// --- The endpoint --------------------------------------------------------------

interface CapturedResponse {
  status: number;
  body: unknown;
}

async function callReadinessEndpoint(
  transportWorkReadiness?: { describe(): Promise<unknown> },
): Promise<CapturedResponse> {
  const captured: CapturedResponse = { status: 0, body: null };
  const response = {
    writeHead(status: number) {
      captured.status = status;
      return this;
    },
    end(payload?: string) {
      captured.body = payload ? JSON.parse(payload) : null;
      return this;
    },
    setHeader() {
      return this;
    },
  } as unknown as ServerResponse;

  const handled = await routeWorkApi({
    request: {} as never,
    response,
    url: new URL(`http://127.0.0.1${WORK_API_DELIVERY_READINESS_PATH}`),
    method: 'GET',
    dependencies: {
      coreStore: new MemoryCoreStore(createDefaultCoreState()),
      transportWorkReadiness,
    },
  });
  assert.equal(handled, true, 'the route is claimed by the work API');
  return captured;
}

test('a host without the golden path reports not-enabled rather than ready', async () => {
  const result = await callReadinessEndpoint(undefined);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    enabled: false,
    workspacePath: null,
    authorizedOwnerCount: 0,
    bindings: [],
  });
});

test('the endpoint returns the readiness evaluation unchanged', async () => {
  // Desktop must show what the transport would decide, not a second opinion.
  const report = {
    enabled: true,
    workspacePath: '/repos/cats',
    authorizedOwnerCount: 1,
    bindings: [{
      bindingId: 'binding-1',
      botName: 'cats_bot',
      deliveryMode: 'commit_only',
      toolScope: 'narrow_write',
      readiness: { ready: true, blockers: [] },
    }],
  };
  const result = await callReadinessEndpoint({ describe: async () => report });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, report);
});
