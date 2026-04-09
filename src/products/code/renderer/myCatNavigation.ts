export {
  buildMyCatPathForPrefix,
  findDirectLaneForCat,
  resolveMyCatStatusDot,
  statusDotClassName,
  statusDotLabel,
  type MyCatNavigationTarget,
  type MyCatStatusDot,
} from '../../shared/renderer/myCatNavigation.js';
import { createResolveMyCatNavigationTarget } from '../../shared/renderer/myCatNavigation.js';
import { CHAT_PREFIX } from '../shared/channelPaths.js';

export const resolveMyCatNavigationTarget = createResolveMyCatNavigationTarget(CHAT_PREFIX);
