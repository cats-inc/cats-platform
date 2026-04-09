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

import type { ChatChannelSummary } from '../api/workspaceContracts.js';
import { resolveMyCatNavigationTargetForPrefix } from '../../../app/renderer/productShell/myCatNavigation.js';

export function createResolveMyCatNavigationTarget(chatPrefix: string) {
  return function resolveMyCatNavigationTarget(
    channels: ChatChannelSummary[],
    catId: string,
  ) {
    return resolveMyCatNavigationTargetForPrefix(chatPrefix, channels, catId);
  };
}
