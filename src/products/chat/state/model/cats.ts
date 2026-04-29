import type {
  CreateCatInput,
  ChatState,
} from '../../api/contracts.js';
import {
  defaultCatProducts,
  ensurePlatformSurfaceIncluded,
  hasPlatformSurface,
  normalizePlatformSurfaceList,
} from '../../../../shared/platformSurfaces.js';
import { resolveRoomRoutingState } from '../room-routing/index.js';
import { createCatRecord } from './recordBuilders.js';
import {
  cloneState,
  isoAt,
  syncChannelDefaultRecipientAndTopology,
} from './shared.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';

export const AVATAR_PALETTE = [
  '#7986CB', '#4DB6AC', '#FFB74D', '#BA68C8',
  '#64B5F6', '#81C784', '#FF8A65', '#9575CD',
  '#4FC3F7', '#A1887F', '#F06292', '#E57373',
] as const;

const DEFAULT_CAT_NAME = 'Boss Cat';
const DEFAULT_AVATAR_COLOR = '#90A4AE';

function updateDirectLaneAfterLeadingCatRemoval(
  channel: ChatState['channels'][number],
  catId: string,
  options: { preserveRecoverableDirectLane: boolean },
): void {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  if (
    isDirectLaneChannel(channel)
    && roomRouting.defaultRecipientId === catId
  ) {
    if (options.preserveRecoverableDirectLane) {
      channel.recoverableDirectLaneCatId = catId;
      channel.channelKind = 'direct_lane';
      roomRouting.mode = 'direct_cat_chat';
      roomRouting.defaultRecipientId = catId;
      channel.roomRouting = roomRouting;
    } else {
      channel.recoverableDirectLaneCatId = null;
      channel.channelKind = 'boss_thread';
      roomRouting.mode = 'boss_chat';
      roomRouting.defaultRecipientId = null;
      channel.roomRouting = roomRouting;
    }
  } else if (
    !options.preserveRecoverableDirectLane
    && channel.recoverableDirectLaneCatId === catId
  ) {
    channel.recoverableDirectLaneCatId = null;
  }
}

function isDirectLaneForCat(
  channel: ChatState['channels'][number],
  catId: string,
): boolean {
  if (channel.recoverableDirectLaneCatId === catId) {
    return true;
  }

  if (!isDirectLaneChannel(channel)) {
    return false;
  }

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  return roomRouting.defaultRecipientId === catId
    || channel.catAssignments.some((assignment) => assignment.catId === catId);
}

function removeDirectLanesForDeletedCat(state: ChatState, catId: string): void {
  const deletedChannelIds = new Set(
    state.channels
      .filter((channel) => isDirectLaneForCat(channel, catId))
      .map((channel) => channel.id),
  );
  if (deletedChannelIds.size === 0) {
    return;
  }

  state.channels = state.channels.filter(
    (channel) => !deletedChannelIds.has(channel.id),
  );
  state.parallelChatGroups = state.parallelChatGroups
    .map((group) => ({
      ...group,
      memberChannelIds: group.memberChannelIds.filter(
        (channelId) => !deletedChannelIds.has(channelId),
      ),
    }))
    .filter((group) => group.memberChannelIds.length > 1);

  if (deletedChannelIds.has(state.selectedChannelId)) {
    state.selectedChannelId = state.channels[0]?.id ?? '';
  }
}

function restoreRecoverableDirectLane(
  channel: ChatState['channels'][number],
  catId: string,
  restoredAt: string,
): void {
  if (channel.recoverableDirectLaneCatId !== catId) {
    return;
  }

  const assignment = channel.catAssignments.find((candidate) => candidate.catId === catId);
  if (!assignment) {
    channel.recoverableDirectLaneCatId = null;
    return;
  }

  assignment.status = 'active';
  assignment.leftAt = null;
  assignment.execution.lease = {
    ...assignment.execution.lease,
    sessionId: null,
    status: 'not_started',
    cwd: null,
    lastError: null,
    laneId: null,
    provider: assignment.execution.target.provider,
    model: assignment.execution.target.model,
    startedAt: null,
    lastUsedAt: null,
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  roomRouting.mode = 'direct_cat_chat';
  roomRouting.defaultRecipientId = catId;
  channel.roomRouting = roomRouting;
  channel.channelKind = 'direct_lane';
  channel.recoverableDirectLaneCatId = null;
  channel.updatedAt = restoredAt;
  if (channel.status === 'planned') {
    channel.status = 'configured';
  }
  syncChannelDefaultRecipientAndTopology(channel);
}

function detachCatFromChannels(
  state: ChatState,
  catId: string,
  detachedAt: string,
  options: { preserveAssignmentHistory: boolean; preserveRecoverableDirectLane: boolean },
): void {
  for (const channel of state.channels) {
    if (options.preserveAssignmentHistory) {
      for (const assignment of channel.catAssignments) {
        if (assignment.catId !== catId) {
          continue;
        }
        assignment.status = 'removed';
        assignment.leftAt = detachedAt;
        assignment.execution.lease = {
          ...assignment.execution.lease,
          sessionId: null,
          status: 'removed',
          cwd: null,
          lastError: null,
          laneId: null,
          provider: null,
          model: null,
          startedAt: null,
          lastUsedAt: null,
        };
      }
    } else {
      channel.catAssignments = channel.catAssignments.filter(
        (assignment) => assignment.catId !== catId,
      );
    }

    updateDirectLaneAfterLeadingCatRemoval(channel, catId, {
      preserveRecoverableDirectLane: options.preserveRecoverableDirectLane,
    });
    syncChannelDefaultRecipientAndTopology(channel);
  }
}

export function pickAvatarColor(index: number): string {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

export function isDefaultCatName(name: string): boolean {
  return name.trim() === DEFAULT_CAT_NAME;
}

function assertUniqueCatName(state: ChatState, name: string, excludeCatId?: string): void {
  const normalized = name.trim().toLowerCase();
  const duplicate = state.cats.find(
    (c) => c.id !== excludeCatId && c.name.trim().toLowerCase() === normalized,
  );
  if (duplicate) {
    throw new Error(`A cat named "${duplicate.name}" already exists`);
  }
}

function catHasChatSurface(products: readonly string[] | null | undefined): boolean {
  return hasPlatformSurface(products, 'chat', {
    fallback: defaultCatProducts(),
  });
}

export function createCat(
  state: ChatState,
  input: CreateCatInput,
  now: Date = new Date(),
): ChatState {
  const maxCats = state.capabilities.maxCats ?? Infinity;
  const activeCats = state.cats.filter((c) => c.status === 'active');
  if (activeCats.length >= maxCats) {
    throw new Error(`Cat limit reached (max ${maxCats})`);
  }
  assertUniqueCatName(state, input.name);
  const nextState = cloneState(state);
  const normalizedProducts = normalizePlatformSurfaceList(input.products, {
    allowed: normalizePlatformSurfaceList(state.capabilities.availableSurfaces, {
      fallback: defaultCatProducts(),
    }),
    fallback: defaultCatProducts(),
  });
  const cat = createCatRecord({
    ...input,
    products: input.makeBoss
      ? ensurePlatformSurfaceIncluded(normalizedProducts, 'chat')
      : normalizedProducts,
  }, isoAt(now));
  if (!cat.avatarColor) {
    cat.avatarColor = isDefaultCatName(cat.name)
      ? DEFAULT_AVATAR_COLOR
      : pickAvatarColor(nextState.cats.length);
  }
  nextState.cats.unshift(cat);
  if (input.makeBoss) {
    nextState.bossCatId = cat.id;
  }
  return nextState;
}

export function archiveCat(
  state: ChatState,
  catId: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const cat = nextState.cats.find((p) => p.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  if (cat.status === 'archived') {
    throw new Error('Cat is already archived');
  }
  if (nextState.bossCatId === catId) {
    nextState.bossCatId = null;
  }
  cat.status = 'archived';
  cat.archivedAt = isoAt(now);
  cat.updatedAt = cat.archivedAt;
  detachCatFromChannels(nextState, catId, cat.archivedAt, {
    preserveAssignmentHistory: true,
    preserveRecoverableDirectLane: true,
  });
  return nextState;
}

export function unarchiveCat(
  state: ChatState,
  catId: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const cat = nextState.cats.find((candidate) => candidate.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  if (cat.status === 'active') {
    throw new Error('Cat is already active');
  }

  const maxCats = nextState.capabilities.maxCats ?? Infinity;
  const activeCats = nextState.cats.filter((candidate) => candidate.status === 'active');
  if (activeCats.length >= maxCats) {
    throw new Error(`Cat limit reached (max ${maxCats})`);
  }

  cat.status = 'active';
  cat.archivedAt = null;
  cat.updatedAt = isoAt(now);
  for (const channel of nextState.channels) {
    restoreRecoverableDirectLane(channel, catId, cat.updatedAt);
  }
  return nextState;
}

export function deleteCat(
  state: ChatState,
  catId: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const catIndex = nextState.cats.findIndex((p) => p.id === catId);
  if (catIndex === -1) {
    throw new Error(`Cat not found: ${catId}`);
  }
  if (nextState.bossCatId === catId) {
    nextState.bossCatId = null;
  }
  nextState.cats.splice(catIndex, 1);
  removeDirectLanesForDeletedCat(nextState, catId);
  detachCatFromChannels(nextState, catId, isoAt(now), {
    preserveAssignmentHistory: false,
    preserveRecoverableDirectLane: false,
  });
  return nextState;
}

export function updateCatSkillProfile(
  state: ChatState,
  catId: string,
  skillProfile: string | null,
): ChatState {
  const nextState = cloneState(state);
  const cat = nextState.cats.find((p) => p.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  cat.skillProfile = skillProfile;
  cat.updatedAt = new Date().toISOString();
  return nextState;
}

export function setBossCat(
  state: ChatState,
  catId: string,
): ChatState {
  const nextState = cloneState(state);
  const cat = nextState.cats.find((p) => p.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  if (cat.status !== 'active') {
    throw new Error(`Cat is not active: ${catId}`);
  }
  cat.products = ensurePlatformSurfaceIncluded(cat.products, 'chat');
  cat.updatedAt = new Date().toISOString();
  nextState.bossCatId = catId;
  return nextState;
}

export function updateCatProducts(
  state: ChatState,
  catId: string,
  products: string[],
): ChatState {
  const nextState = cloneState(state);
  const cat = nextState.cats.find((p) => p.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  const normalizedProducts = normalizePlatformSurfaceList(products, {
    allowed: normalizePlatformSurfaceList(state.capabilities.availableSurfaces, {
      fallback: defaultCatProducts(),
    }),
  });
  if (normalizedProducts.length === 0) {
    throw new Error('Cat must be available in at least one product');
  }
  const hadChatSurface = catHasChatSurface(cat.products);
  cat.products = nextState.bossCatId === catId
    ? ensurePlatformSurfaceIncluded(normalizedProducts, 'chat')
    : normalizedProducts;
  cat.updatedAt = new Date().toISOString();
  if (hadChatSurface && !catHasChatSurface(cat.products)) {
    detachCatFromChannels(nextState, catId, cat.updatedAt, {
      preserveAssignmentHistory: true,
      preserveRecoverableDirectLane: false,
    });
  }
  return nextState;
}

export function updateCatExecutionTarget(
  state: ChatState,
  catId: string,
  target: { provider?: string; instance?: string | null; model?: string | null; modelSelection?: import('../../../../shared/providerSelection.js').ProviderModelSelection | null },
): ChatState {
  const nextState = cloneState(state);
  const cat = nextState.cats.find((p) => p.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  if (target.provider !== undefined) {
    cat.defaultExecutionTarget.provider = target.provider;
  }
  if (target.instance !== undefined) {
    cat.defaultExecutionTarget.instance = target.instance || null;
  }
  if (target.model !== undefined) {
    cat.defaultExecutionTarget.model = target.model || null;
  }
  if (target.modelSelection !== undefined) {
    cat.defaultModelSelection = target.modelSelection ?? null;
  }
  cat.updatedAt = new Date().toISOString();
  return nextState;
}

export function renameCat(
  state: ChatState,
  catId: string,
  name: string,
): ChatState {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Cat name cannot be empty');
  }
  assertUniqueCatName(state, trimmed, catId);
  const nextState = cloneState(state);
  const cat = nextState.cats.find((p) => p.id === catId);
  if (!cat) {
    throw new Error(`Cat not found: ${catId}`);
  }
  const wasDefault = isDefaultCatName(cat.name);
  cat.name = trimmed;
  if (isDefaultCatName(trimmed)) {
    cat.avatarColor = DEFAULT_AVATAR_COLOR;
  } else if (wasDefault && cat.avatarColor === DEFAULT_AVATAR_COLOR) {
    cat.avatarColor = pickAvatarColor(state.cats.indexOf(state.cats.find((c) => c.id === catId)!));
  }
  cat.updatedAt = new Date().toISOString();
  return nextState;
}
