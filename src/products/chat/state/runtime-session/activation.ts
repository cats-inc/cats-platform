import type {
  ChannelActivationResult,
  ChatState,
} from '../../api/contracts.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import { setChannelRoomRouting } from '../model/index.js';
import { ensureTargetSession } from './wake.js';
import {
  buildChannelActivationResult,
  type RuntimeSessionRoutingOptions,
} from './shared.js';
import { ensureChannelMarkedActive } from './state.js';
import {
  applyChannelActivationStatus,
  resolveChannelActivationTargets,
  resolveRoomEntryWakeTarget,
} from './activationSupport.js';

export async function activateChannelSessions(
  state: ChatState,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RuntimeSessionRoutingOptions = {},
): Promise<{ state: ChatState; results: ChannelActivationResult[] }> {
  let nextState = state;
  const results: ChannelActivationResult[] = [];
  const activationTargets = resolveChannelActivationTargets(nextState, channelId);

  for (const target of activationTargets) {
    const ensured = await ensureTargetSession(
      nextState,
      channelId,
      target,
      runtimeClient,
      now,
      {
        ...options,
        forceReviveClosedSessions: true,
      },
    );
    nextState = ensured.state;
    results.push(buildChannelActivationResult({
      target,
      ensured,
    }));
  }

  nextState = applyChannelActivationStatus({
    state: nextState,
    channelId,
    results,
    now,
  });

  return { state: nextState, results };
}

export async function wakeChannelEntryParticipant(
  state: ChatState,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RuntimeSessionRoutingOptions = {},
): Promise<{
  state: ChatState;
  result: ChannelActivationResult | null;
}> {
  const roomEntryTarget = resolveRoomEntryWakeTarget({
    state,
    channelId,
    now,
  });
  let nextState = roomEntryTarget.state;
  const roomRouting = roomEntryTarget.roomRouting;
  const target = roomEntryTarget.target;

  if (!target) {
    return {
      state: nextState,
      result: roomEntryTarget.result,
    };
  }

  const ensured = await ensureTargetSession(
    nextState,
    channelId,
    target,
    runtimeClient,
    now,
    {
      companionStore: options.companionStore,
      memoryService: options.memoryService,
      forceReviveClosedSessions: options.forceReviveClosedSessions,
      roomRouting,
      wakeTrigger: 'room_entry',
      wakeReason: 'room_entry',
    },
  );
  nextState = ensured.state;
  nextState = setChannelRoomRouting(nextState, channelId, roomRouting, now);

  if (ensured.error) {
    return {
      state: nextState,
      result: buildChannelActivationResult({
        target,
        ensured,
      }),
    };
  }

  nextState = ensureChannelMarkedActive(nextState, channelId, now);
  return {
    state: nextState,
    result: buildChannelActivationResult({
      target,
      ensured,
    }),
  };
}
