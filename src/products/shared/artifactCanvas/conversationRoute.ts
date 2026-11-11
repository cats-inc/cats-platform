import type { CatsCoreState } from '../../../core/types.js';
import { buildChatTaskId } from '../../../shared/chatCoreIds.js';
import { readProductScope } from '../../../shared/productScope.js';
import type { CanvasRouteOptions, CanvasSurfaceRef } from './contracts.js';

/**
 * SPEC-141 FR-9: a conversation's canvas opens beside it on the product where it lives. A
 * `code_conversation` surface is a conversation with Code's tools, which lives on Work when its
 * scope is `work` (ADR-149 D5) and on Code otherwise. The scope is read from the copy on the
 * conversation's Core task, which every sync rewrites from the conversation.
 */
export function resolveCanvasRouteOptions(
  core: Pick<CatsCoreState, 'tasks'>,
  surface: CanvasSurfaceRef,
): CanvasRouteOptions {
  if (surface.kind !== 'code_conversation') {
    return {};
  }
  const metadata = core.tasks.find((task) => task.id === buildChatTaskId(surface.surfaceId))?.metadata;
  if (!metadata) {
    return {};
  }
  const scope = readProductScope({
    productScope: metadata.productScope,
    originSurface: metadata.originSurface,
    roomMode: metadata.roomRoutingMode,
  });
  return scope === 'work' ? { conversationProduct: 'work' } : {};
}
