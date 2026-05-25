import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = fileURLToPath(new URL('../src', import.meta.url));
const ALLOWED_SHARED_PRODUCT_IMPORTS = new Set([
  'shared/app-shell.ts',
  'shared/channelPaths.ts',
]);
const ALLOWED_BOUNDARY_IMPORTS = new Set([
  // Platform fanout/entity-subscription seams still adapt chat-owned records
  // directly; keep the exception edge-specific so new platform -> product
  // imports continue to fail this guardrail.
  'platform/orchestration/entitySubscriptions/channel.ts -> products/chat/api/contracts.ts',
  'platform/orchestration/entitySubscriptions/channel.ts -> products/chat/api/routeSupport.ts',
  'platform/transports/fanout/registry.ts -> products/chat/api/contracts.ts',
  'platform/transports/fanout/subscriber.ts -> products/chat/api/contracts.ts',
  'platform/transports/fanout/subscriber.ts -> products/chat/api/chatEventHub.ts',
  'platform/transports/fanout/subscriber.ts -> products/chat/state/botBindings.ts',
  'platform/transports/fanout/subscriber.ts -> products/chat/state/model/index.ts',
  'platform/transports/fanout/subscriber.ts -> products/chat/state/store.ts',
  'platform/transports/telegram/fanout.ts -> products/chat/api/contracts.ts',

  // Chat dispatch currently owns work-tool intent routing until the work/chat
  // contract moves behind a product-neutral orchestration port.
  'products/chat/api/routeSupport.ts -> products/work/integrations/externalIssueImportFetcher.ts',
  'products/chat/api/runtimeBridgeRoutes.ts -> products/work/shared/workToolSurface.ts',
  'products/chat/state/deterministicRouterAdapter.ts -> products/work/integrations/externalIssueImportFetcher.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/state/workIntakeDelegate.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/state/workTriageDelegate.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/state/workExecutionPreparationDelegate.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/state/workExecutionTaskDelegate.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/state/workExternalBindingDelegate.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/state/workExternalIssueImportDelegate.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/integrations/externalIssueImportFetcher.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/shared/workExecutionPreparationPhase.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/shared/workExternalBindingPhase.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/shared/workExternalIssueImportPhase.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/shared/externalTrackerUrls.ts',
  'products/chat/state/runtime-dispatch/routing.ts -> products/work/shared/workToolSurface.ts',
  'products/chat/state/runtime-dispatch/turn.ts -> products/work/shared/workToolSurface.ts',
  'products/chat/state/runtime-dispatch/turn.ts -> products/work/shared/workToolObservation.ts',
  'products/chat/state/runtime-dispatch/turn.ts -> products/work/shared/workExecutionPreparationPhase.ts',
  'products/chat/state/runtime-dispatch/turn.ts -> products/work/shared/workExternalBindingPhase.ts',
  'products/chat/state/runtime-dispatch/turn.ts -> products/work/shared/workExternalIssueImportPhase.ts',
  'products/chat/state/telegramBridgeAdapter.ts -> products/work/integrations/externalIssueImportFetcher.ts',
  'products/chat/state/workIntakeSourceContext.ts -> products/work/shared/workIntakeSourceContext.ts',
  'products/chat/state/workToolIntentResolver.ts -> products/work/shared/workToolSurface.ts',
  'products/chat/state/workToolIntentResolver.ts -> products/work/shared/workToolIntent.ts',
  'products/chat/state/workToolIntentResolver.ts -> products/work/shared/workExecutionPreparationPhase.ts',
  'products/chat/state/workToolIntentResolver.ts -> products/work/shared/workExternalBindingPhase.ts',
  'products/chat/state/workToolIntentResolver.ts -> products/work/shared/workExternalIssueImportPhase.ts',

  // The shared product shell still reuses chat-specific participant and
  // composer utilities. These are exact edges, not product-wide exemptions.
  'products/shared/channelParticipants.ts -> products/chat/shared/channelParticipants.ts',
  'products/shared/operator-loop/index.ts -> products/chat/shared/channelCanonicalIdentity.ts',
  'products/shared/renderer/components/chat-view/CompanionMessageReferencePreviews.tsx -> products/chat/companion/composerReferenceDetector.ts',
  'products/shared/renderer/components/chat-view/CompanionMessageReferencePreviews.tsx -> products/chat/companion/contentReference.ts',
  'products/shared/renderer/components/chat-view/CompanionMessageReferencePreviews.tsx -> products/chat/companion/contentResolver.ts',
  'products/shared/renderer/components/chat-view/CompanionMessageReferencePreviews.tsx -> products/chat/companion/messageReferenceSnapshot.ts',
  'products/shared/renderer/composerDispatch.ts -> products/chat/shared/channelTopology.ts',
  'products/shared/renderer/composerMessageMetadata.ts -> products/chat/shared/channelTopology.ts',
  'products/shared/renderer/hooks/useLiveIndicator.ts -> products/chat/shared/channelCanonicalIdentity.ts',
  'products/shared/renderer/hooks/useLiveIndicator.ts -> products/chat/shared/channelTopology.ts',
  'products/shared/renderer/hooks/useWorkspaceExecutionTargetState.ts -> products/chat/shared/channelTopology.ts',
  'products/shared/renderer/WorkspaceProductApp.tsx -> products/chat/shared/channelTopology.ts',
  'shared/chatCoreIds.ts -> products/chat/api/contracts.ts',
]);

async function* walkSourceFiles(rootDirectory) {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const resolvedPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      yield* walkSourceFiles(resolvedPath);
      continue;
    }
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) {
      continue;
    }
    yield resolvedPath;
  }
}

function extractRelativeSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\w{},*$]+?\s+from\s+)?['"](\.[^'"]+)['"]/gu,
    /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

async function exists(candidatePath) {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRelativeImport(sourceFile, specifier) {
  const absoluteBase = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [];

  if (path.extname(absoluteBase)) {
    candidates.push(absoluteBase);
    if (absoluteBase.endsWith('.js')) {
      candidates.push(absoluteBase.slice(0, -3) + '.ts');
      candidates.push(absoluteBase.slice(0, -3) + '.tsx');
    }
  } else {
    candidates.push(`${absoluteBase}.ts`);
    candidates.push(`${absoluteBase}.tsx`);
    candidates.push(path.join(absoluteBase, 'index.ts'));
    candidates.push(path.join(absoluteBase, 'index.tsx'));
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith(SOURCE_ROOT)) {
      continue;
    }
    if (await exists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function relativeSourcePath(filePath) {
  return path.relative(SOURCE_ROOT, filePath).replace(/\\/g, '/');
}

function productNameFor(relativePath) {
  const match = /^products\/([^/]+)\//u.exec(relativePath);
  return match?.[1] ?? null;
}

function recordBoundaryViolation(violations, relativePath, importedRelativePath) {
  const violation = `${relativePath} -> ${importedRelativePath}`;
  if (!ALLOWED_BOUNDARY_IMPORTS.has(violation)) {
    violations.push(violation);
  }
}

test('dependency graph keeps core, platform, and product ownership boundaries intact', async () => {
  const violations = [];

  for await (const sourceFile of walkSourceFiles(SOURCE_ROOT)) {
    const relativePath = relativeSourcePath(sourceFile);
    const source = await readFile(sourceFile, 'utf8');
    const specifiers = extractRelativeSpecifiers(source);

    for (const specifier of specifiers) {
      const resolvedImport = await resolveRelativeImport(sourceFile, specifier);
      if (!resolvedImport) {
        continue;
      }

      const importedRelativePath = relativeSourcePath(resolvedImport);

      if (relativePath.startsWith('core/') && /^products\//u.test(importedRelativePath)) {
        recordBoundaryViolation(violations, relativePath, importedRelativePath);
        continue;
      }

      if (relativePath.startsWith('platform/') && /^products\//u.test(importedRelativePath)) {
        recordBoundaryViolation(violations, relativePath, importedRelativePath);
        continue;
      }

      if (
        relativePath.startsWith('shared/')
        && /^products\//u.test(importedRelativePath)
        && !ALLOWED_SHARED_PRODUCT_IMPORTS.has(relativePath)
      ) {
        recordBoundaryViolation(violations, relativePath, importedRelativePath);
        continue;
      }

      if (relativePath.startsWith('products/')) {
        const sourceProduct = productNameFor(relativePath);
        const targetProduct = productNameFor(importedRelativePath);
        if (
          sourceProduct === 'shared'
          && targetProduct
          && targetProduct !== 'shared'
        ) {
          recordBoundaryViolation(violations, relativePath, importedRelativePath);
          continue;
        }

        if (
          sourceProduct
          && targetProduct
          && sourceProduct !== 'shared'
          && targetProduct !== 'shared'
          && sourceProduct !== targetProduct
        ) {
          recordBoundaryViolation(violations, relativePath, importedRelativePath);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});
