/**
 * Owner profile fixture used by Settings until the live owner profile /
 * read model lands. Phase 7 swaps this for whatever the live connection
 * resolves to. Per the review, the renderer must not hard-code identity.
 */

export interface OwnerProfile {
  displayName: string;
  email: string;
}

export const ownerFixture: OwnerProfile = {
  displayName: 'Owner',
  email: 'owner@example.com',
};
