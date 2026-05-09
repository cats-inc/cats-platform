import type { ServerResponse } from 'node:http';

export const SUPPORTED_ENTITY_SUBSCRIPTION_KINDS = ['channel', 'artifact'] as const;

export type EntitySubscriptionKind = typeof SUPPORTED_ENTITY_SUBSCRIPTION_KINDS[number];

export interface EntitySubscriptionSnapshotEvent<TState = unknown> {
  kind: EntitySubscriptionKind;
  id: string;
  version: number;
  state: TState;
}

export interface EntitySubscriptionPatchEvent<TPatch = unknown> {
  kind: EntitySubscriptionKind;
  id: string;
  version: number;
  patch: TPatch;
}

export interface EntitySubscriptionCloseEvent {
  reason: string;
}

export type EntitySubscriptionSseEvent<TState = unknown, TPatch = unknown> =
  | { event: 'snapshot'; data: EntitySubscriptionSnapshotEvent<TState> }
  | { event: 'patch'; data: EntitySubscriptionPatchEvent<TPatch> }
  | { event: 'close'; data: EntitySubscriptionCloseEvent };

export function createEntitySubscriptionKey(
  kind: EntitySubscriptionKind,
  id: string,
): string {
  return `${kind}:${id}`;
}

export function serializeEntitySubscriptionSseEvent(
  event: EntitySubscriptionSseEvent,
): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function writeEntitySubscriptionHeaders(response: ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
}

export function writeEntitySubscriptionSseEvent(
  response: ServerResponse,
  event: EntitySubscriptionSseEvent,
): void {
  response.write(serializeEntitySubscriptionSseEvent(event));
}
