export type CatGroup = 'admin' | 'standard';

type GroupedCat = { group?: CatGroup | null };

export function normalizeChatCatGroup(value: unknown): CatGroup {
  return value === 'admin' ? 'admin' : 'standard';
}

/** Admin cats are the Boss Cats; several may exist. */
export function isAdminCat(cat: GroupedCat | null | undefined): boolean {
  return cat?.group === 'admin';
}

export function isAdminCatId(
  cats: ReadonlyArray<{ id: string } & GroupedCat>,
  catId: string | null | undefined,
): boolean {
  return Boolean(catId) && cats.some((cat) => cat.id === catId && isAdminCat(cat));
}

export function listActiveAdminCats<T extends GroupedCat & { status: string }>(
  cats: readonly T[],
): T[] {
  return cats.filter((cat) => cat.status === 'active' && isAdminCat(cat));
}
