/**
 * Membership rules every Directory surface reads the same way, so Desktop
 * and mobile cannot drift (SPEC-103). The types are structural: the mobile
 * boundary passes its own subset of the Directory view.
 */

export const MEMBERSHIP_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a temporary membership's end date has passed. The end date is a
 * whole day: a Cat temporary until 12/31 is still a member on 12/31. A
 * passed date is shown, never hidden (FR-23).
 */
export function isMembershipEnded(
  status: string,
  expiresAt: string | null | undefined,
  now: Date,
): boolean {
  if (status !== 'temp' || !expiresAt) return false;
  const end = Date.parse(expiresAt);
  return Number.isFinite(end) && end + MEMBERSHIP_DAY_MS <= now.getTime();
}

type GroupWithMembers = { members: readonly { catId: string }[] };

/**
 * The Catteries and Clowders a Cat is in, each in Directory order. A
 * Cattery counts only for the Cat's own membership: being in one of its
 * Clowders does not make the Cat a member of it (FR-16).
 */
export function membershipsOfCat<C extends GroupWithMembers, K extends GroupWithMembers>(
  directory: { catteries: readonly C[]; clowders: readonly K[] },
  catId: string,
): {
  catteries: Array<{ group: C; member: C['members'][number] }>;
  clowders: Array<{ group: K; member: K['members'][number] }>;
} {
  const pick = <G extends GroupWithMembers>(groups: readonly G[]) => groups.flatMap((group) => {
    const member = group.members.find((entry) => entry.catId === catId);
    return member ? [{ group, member: member as G['members'][number] }] : [];
  });
  return { catteries: pick(directory.catteries), clowders: pick(directory.clowders) };
}
