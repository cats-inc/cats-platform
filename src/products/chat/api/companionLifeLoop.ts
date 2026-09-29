import {
  createCompanionLifeLoop,
  startCompanionLifeLoop,
} from '../companion/life/loop.js';
import {
  activateChannelLocked,
  deactivateChannelLocked,
  publishChannelLifecycleEvents,
  type ChannelLifecycleDependencies,
} from './resources/channelActivation.js';
import type { ChatApiDependencies } from './routeSupport.js';

export type ChatCompanionLifeLoopDependencies = ChannelLifecycleDependencies
  & Pick<ChatApiDependencies, 'mutationGate' | 'companionActivityStore'>;

/**
 * SPEC-124 life loop wired to the same wake/sleep bodies and mutation gate as
 * the REST routes, so Desktop presence updates the same way for both.
 */
export function startChatCompanionLifeLoop(
  dependencies: ChatCompanionLifeLoopDependencies,
): () => void {
  const loop = createCompanionLifeLoop({
    readChatState: () => dependencies.chatStore.read(),
    readCompanionSnapshot: () => dependencies.companionStore.readSnapshot(),
    runtimeClient: dependencies.runtimeClient,
    activityStore: dependencies.companionActivityStore,
    activateLane: (channelId) => dependencies.mutationGate.run(channelId, async () => {
      const activation = await activateChannelLocked(dependencies, channelId);
      publishChannelLifecycleEvents(dependencies, channelId);
      return activation.results;
    }),
    deactivateLane: (channelId) => dependencies.mutationGate.run(channelId, async () => {
      const deactivation = await deactivateChannelLocked(dependencies, channelId);
      publishChannelLifecycleEvents(dependencies, channelId);
      return deactivation;
    }),
    now: () => dependencies.now?.() ?? new Date(),
  });
  return startCompanionLifeLoop(loop);
}
