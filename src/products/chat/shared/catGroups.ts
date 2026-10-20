import type { ChatCat, ChatCatGroup } from '../api/contracts.js';

type GroupedCat = Pick<ChatCat, 'group'>;

export function normalizeChatCatGroup(value: unknown): ChatCatGroup {
  return value === 'admin' ? 'admin' : 'standard';
}

/** Admin cats are the Boss Cats; several may exist. */
export function isAdminCat(cat: GroupedCat | null | undefined): boolean {
  return cat?.group === 'admin';
}

export function isAdminCatId(
  cats: ReadonlyArray<Pick<ChatCat, 'id' | 'group'>>,
  catId: string | null | undefined,
): boolean {
  return Boolean(catId) && cats.some((cat) => cat.id === catId && isAdminCat(cat));
}

export function listActiveAdminCats<T extends Pick<ChatCat, 'group' | 'status'>>(
  cats: readonly T[],
): T[] {
  return cats.filter((cat) => cat.status === 'active' && isAdminCat(cat));
}
