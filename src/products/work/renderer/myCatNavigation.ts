export {
  buildMyCatPathForPrefix,
  findDirectLaneForCat,
  resolveMyCatStatusDot,
  resolveMyCatNavigationTargetForPrefix,
  statusDotClassName,
  statusDotLabel,
  type MyCatNavigationTarget,
  type MyCatStatusDot,
} from '../../../app/renderer/productShell/myCatNavigation.js';

import type { ChatChannelSummary } from '../api/contracts.js';
import { CHAT_PREFIX } from '../shared/channelPaths.js';
import { resolveMyCatNavigationTargetForPrefix } from '../../../app/renderer/productShell/myCatNavigation.js';

export function resolveMyCatNavigationTarget(
  channels: ChatChannelSummary[],
  catId: string,
) {
  return resolveMyCatNavigationTargetForPrefix(CHAT_PREFIX, channels, catId);
}
