// Inbound direct-lane transport binding resolution for chat dispatch.
//
// Slice 3 of the Conductor-assigned plan. The chat runtime already
// stamps a deterministic direct-lane transport binding id on outbound
// messages via `buildDirectLaneTransportBindingId(channelId)`. The
// inbound side (Telegram bridge, future API routes) needs to verify
// that the binding actually exists in core and resolves to a direct-
// lane conversation BEFORE producing user-message records on its
// behalf — otherwise the dispatch will silently stamp an id that no
// downstream consumer can dereference.
//
// This module wraps the canonical `resolveTransportBindingDirectLane`
// helper with chat-runtime-dispatch idioms so the binding id is
// derived from the channel, the resolution is structured, and a
// diagnostic reason is available when the resolver short-circuits.
// API routes / repair paths can adopt the helper without re-deriving
// the deterministic id rule themselves.

import { buildDirectLaneTransportBindingId } from '../../../../shared/chatCoreIds.js';
import {
  resolveTransportBindingDirectLane,
  type TransportDirectLaneResolution,
  type TransportDirectLaneStatus,
} from '../../../../core/transportBindingDirectLane.js';
import type { CatsCoreState } from '../../../../core/types.js';

export interface DirectLaneInboundContext {
  /** Deterministic transport binding id built from the channel. */
  transportBindingId: string;
  /** Resolution status from the canonical resolver. */
  status: TransportDirectLaneStatus;
  /** When `status === "resolved"`, the canonical conversation id the
   *  binding points at. Null in every other arm. */
  conversationId: string | null;
  /** Human-readable reason emitted by the resolver when status !==
   *  "resolved". Useful for runtime_error metadata or repair paths. */
  reason: string | null;
  /** Convenience boolean for callers that only need to gate on
   *  "ready to dispatch?". True only when status === "resolved". */
  ready: boolean;
}

export function resolveDirectLaneInboundContextForChannel(
  core: CatsCoreState,
  channelId: string,
): DirectLaneInboundContext {
  const transportBindingId = buildDirectLaneTransportBindingId(channelId);
  const resolution: TransportDirectLaneResolution = resolveTransportBindingDirectLane(
    core,
    transportBindingId,
  );
  return {
    transportBindingId,
    status: resolution.status,
    conversationId: resolution.status === 'resolved'
      ? resolution.conversationId
      : null,
    reason: resolution.reason,
    ready: resolution.status === 'resolved',
  };
}

/**
 * Returns true when the channel's direct-lane binding can carry a
 * canonical inbound dispatch. Falsy result implies the caller should
 * surface a diagnostic (or short-circuit) rather than continue.
 */
export function isDirectLaneReadyForInboundDispatch(
  core: CatsCoreState,
  channelId: string,
): boolean {
  return resolveDirectLaneInboundContextForChannel(core, channelId).ready;
}
