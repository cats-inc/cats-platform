import type {
  CreateCatInput,
  ChatState,
} from '../../api/contracts.js';
import {
  defaultCatProducts,
  ensureSuiteSurfaceIncluded,
  normalizeSuiteSurfaceList,
} from '../../../../shared/suiteSurfaces.js';
import { createCatRecord } from './recordBuilders.js';
import { cloneState, isoAt } from './shared.js';

export const AVATAR_PALETTE = [
  '#7986CB', '#4DB6AC', '#FFB74D', '#BA68C8',
  '#64B5F6', '#81C784', '#FF8A65', '#9575CD',
  '#4FC3F7', '#A1887F', '#F06292', '#E57373',
] as const;

const DEFAULT_CAT_NAME = 'Boss Cat';
const DEFAULT_AVATAR_COLOR = '#90A4AE';

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
  const normalizedProducts = normalizeSuiteSurfaceList(input.products, {
    allowed: normalizeSuiteSurfaceList(state.capabilities.availableSurfaces, {
      fallback: defaultCatProducts(),
    }),
    fallback: defaultCatProducts(),
  });
  const cat = createCatRecord({
    ...input,
    products: input.makeBoss
      ? ensureSuiteSurfaceIncluded(normalizedProducts, 'chat')
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
  cat.archivedAt = new Date().toISOString();
  cat.updatedAt = cat.archivedAt;
  for (const channel of nextState.channels) {
    channel.catAssignments = channel.catAssignments.filter((a) => a.catId !== catId);
  }
  return nextState;
}

export function deleteCat(
  state: ChatState,
  catId: string,
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
  for (const channel of nextState.channels) {
    channel.catAssignments = channel.catAssignments.filter((a) => a.catId !== catId);
  }
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
  cat.products = ensureSuiteSurfaceIncluded(cat.products, 'chat');
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
  const normalizedProducts = normalizeSuiteSurfaceList(products, {
    allowed: normalizeSuiteSurfaceList(state.capabilities.availableSurfaces, {
      fallback: defaultCatProducts(),
    }),
  });
  if (normalizedProducts.length === 0) {
    throw new Error('Cat must be available in at least one product');
  }
  cat.products = nextState.bossCatId === catId
    ? ensureSuiteSurfaceIncluded(normalizedProducts, 'chat')
    : normalizedProducts;
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
