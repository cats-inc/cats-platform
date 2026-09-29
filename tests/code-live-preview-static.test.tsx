import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import {
  CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
  DEFAULT_LIVE_PREVIEW_CONFIG,
  STATIC_LIVE_PREVIEW_PROFILE,
} from '../src/products/code/livePreview/contracts.ts';
import { materializeLivePreviewArtifactAndShowInCanvas } from '../src/products/code/livePreview/artifactMaterialization.ts';
import { createCodeLivePreviewSupervisor } from '../src/products/code/livePreview/host.ts';
import { DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG } from '../src/products/shared/artifactCanvas/iframePolicy.ts';
import { buildArtifactCanvasProjection } from '../src/products/shared/artifactCanvas/projection.ts';
import { ArtifactCanvasRenderIntentHub } from '../src/products/shared/artifactCanvas/renderIntent.ts';

const SURFACE = { kind: 'code_conversation' as const, surfaceId: 'channel-1' };

function createWorkspace(): { root: string; site: string; cleanup: () => void } {
  const base = mkdtempSync(join(tmpdir(), 'cats-static-preview-'));
  const root = join(base, 'workspace');
  const site = join(root, 'calculator');
  mkdirSync(site, { recursive: true });
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>Calc</title><script src="app.js"></script>');
  writeFileSync(join(site, 'app.js'), 'document.title = "2 + 3 = 5";');
  writeFileSync(join(site, '.env'), 'SECRET=site');
  writeFileSync(join(root, 'secret.txt'), 'outside the lease root');
  return { root, site, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function createSupervisor() {
  return createCodeLivePreviewSupervisor({
    ...DEFAULT_LIVE_PREVIEW_CONFIG,
    portRange: { start: 47190, end: 47199 },
  });
}

function rawGet(origin: string, path: string, host?: string, method = 'GET'): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  const url = new URL(path, origin);
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path,
      method,
      headers: host ? { Host: host } : {},
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the static profile serves only the artifact directory on its leased origin', async () => {
  const { root, site, cleanup } = createWorkspace();
  const supervisor = createSupervisor();
  try {
    const started = await supervisor.start({
      commandProfileId: STATIC_LIVE_PREVIEW_PROFILE.id,
      workspace: { kind: 'code_workspace', id: 'workspace-1', rootPath: root },
      artifactDirectory: site,
      surface: SURFACE,
    });
    assert.equal(started.status, 'accepted', JSON.stringify(started));
    if (started.status !== 'accepted') return;
    const origin = started.origin;
    assert.match(origin, /^http:\/\/127\.0\.0\.1:4719\d$/u);

    const index = await rawGet(origin, '/');
    assert.equal(index.status, 200);
    assert.match(String(index.headers['content-type']), /^text\/html/u);
    assert.equal(index.headers['cache-control'], 'no-store');
    assert.match(index.body, /<title>Calc<\/title>/u);
    assert.match(String((await rawGet(origin, '/app.js')).headers['content-type']), /^text\/javascript/u);

    for (const path of ['/.env', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/secret.txt', '/missing.html']) {
      assert.equal((await rawGet(origin, path)).status, 404, path);
    }
    assert.equal((await rawGet(origin, '/', 'evil.example:80')).status, 421);
    assert.equal((await rawGet(origin, '/', undefined, 'POST')).status, 405);

    let linked = false;
    try {
      symlinkSync(join(root, 'secret.txt'), join(site, 'escape.txt'));
      linked = true;
    } catch {
      // Creating symlinks needs Developer Mode on Windows; the lexical checks still ran.
    }
    if (linked) assert.equal((await rawGet(origin, '/escape.txt')).status, 404);

    const lease = supervisor.getLease(started.previewId);
    assert.equal(lease?.status, 'ready');
    await supervisor.stop(started.previewId);
    await assert.rejects(rawGet(origin, '/'));
  } finally {
    await supervisor.stopAll('test_cleanup');
    cleanup();
  }
});

test('artifactDirectory must stay inside the workspace root', async () => {
  const { root, cleanup } = createWorkspace();
  const supervisor = createSupervisor();
  try {
    const result = await supervisor.start({
      commandProfileId: STATIC_LIVE_PREVIEW_PROFILE.id,
      workspace: { kind: 'code_workspace', id: 'workspace-1', rootPath: join(root, 'calculator') },
      artifactDirectory: root,
      surface: SURFACE,
    });
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.equal(result.error.code, 'live_preview_request_invalid');
  } finally {
    cleanup();
  }
});

test('a static lease on a Code conversation opens as a scripted canvas iframe', async () => {
  const { root, site, cleanup } = createWorkspace();
  const supervisor = createSupervisor();
  try {
    const started = await supervisor.start({
      commandProfileId: STATIC_LIVE_PREVIEW_PROFILE.id,
      workspace: { kind: 'code_workspace', id: 'workspace-1', rootPath: root },
      artifactDirectory: site,
      surface: SURFACE,
    });
    assert.equal(started.status, 'accepted');
    if (started.status !== 'accepted') return;
    const lease = supervisor.getLease(started.previewId)!;
    const core = upsertCoreConversation(createDefaultCoreState(), {
      id: 'conversation-channel-channel-1',
      title: 'Calculator',
      kind: 'code_thread',
      status: 'active',
    }).core;
    const policyConfig = {
      ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
      scriptedPreviewProducerAllowlist: [
        { producerKind: 'tool' as const, producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY },
      ],
    };

    const shown = materializeLivePreviewArtifactAndShowInCanvas(core, lease, {
      entryPath: '/index.html',
      title: 'Calculator',
      policyConfig,
      supervisorPreviewLeaseStore: supervisor,
      renderIntentHub: new ArtifactCanvasRenderIntentHub(),
    });
    assert.equal(shown.status, 'shown', JSON.stringify(shown.status === 'skipped' ? shown.reason : null));
    if (shown.status !== 'shown') return;
    assert.equal(shown.artifact.conversationId, 'conversation-channel-channel-1');
    assert.equal(shown.artifact.path, `${started.origin}/index.html`);
    // Until the lease names its artifact, a direct projection stays static.
    const unattached = buildArtifactCanvasProjection({
      core: shown.core, surface: SURFACE, artifactId: shown.artifact.id, policyConfig,
      supervisorPreviewLeaseStore: supervisor,
    });
    assert.equal(unattached.status === 'ok' ? unattached.projection.iframeSandboxProfile?.name : null, 'static');
    assert.ok(supervisor.attachArtifact(started.previewId, shown.artifact.id));

    const projection = buildArtifactCanvasProjection({
      core: shown.core,
      surface: SURFACE,
      artifactId: shown.artifact.id,
      policyConfig,
      supervisorPreviewLeaseStore: supervisor,
    });
    assert.equal(projection.status, 'ok');
    if (projection.status !== 'ok') return;
    assert.equal(projection.projection.presentationResolved, 'iframe');
    assert.equal(projection.projection.iframeSandboxProfile?.name, 'scripted-cross-origin');

    // The same lease cannot lend scripts to an agent-declared artifact.
    const agentCore = {
      ...shown.core,
      artifacts: shown.core.artifacts.map((artifact) => artifact.id !== shown.artifact.id ? artifact : {
        ...artifact,
        metadata: {
          ...artifact.metadata,
          codeArtifactDeclaration: {
            ...(artifact.metadata.codeArtifactDeclaration as Record<string, unknown>),
            producerKind: 'agent',
            idempotency: {
              ...((artifact.metadata.codeArtifactDeclaration as Record<string, unknown>)
                .idempotency as Record<string, unknown>),
              producerKind: 'agent',
            },
          },
        },
      }),
    };
    const agentProjection = buildArtifactCanvasProjection({
      core: agentCore, surface: SURFACE, artifactId: shown.artifact.id, policyConfig,
      supervisorPreviewLeaseStore: supervisor,
    });
    assert.equal(agentProjection.status === 'ok' ? agentProjection.projection.iframeSandboxProfile?.name : null, 'static');

    const unsafe = materializeLivePreviewArtifactAndShowInCanvas(core, lease, {
      entryPath: '/../secret.txt',
      policyConfig,
      supervisorPreviewLeaseStore: supervisor,
    });
    assert.equal(unsafe.status === 'skipped' ? unsafe.reason : unsafe.status, 'entry_path_invalid');
  } finally {
    await supervisor.stopAll('test_cleanup');
    cleanup();
  }
});

test('config enables previews and scripted supervisor previews by default', () => {
  const config = loadConfig({});
  assert.equal(config.codeLivePreview.enabled, true);
  assert.equal(config.codeLivePreview.useRealProcessAdapter, false);
  assert.deepEqual(config.artifactCanvas.scriptedPreviewProducerAllowlist, [
    { producerKind: 'tool', producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY },
  ]);
});
