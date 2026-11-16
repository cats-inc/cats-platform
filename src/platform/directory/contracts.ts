import type {
  CatteryMembershipStatus,
  CatteryRole,
  ClowderRole,
  MembershipStatus,
} from '../../shared/platform-contract.js';

export type { CatteryMembershipStatus, CatteryRole, ClowderRole };

/**
 * SPEC-103: Clowders (貓群) and Catteries (貓窩) group Cats. A group never owns a
 * Cat: deleting a group ends its memberships and nothing else, and no Cat or
 * Clowder has to belong to any group.
 *
 * The directory lives in its own file beside the chat state, not in Core state,
 * so a build that does not know it never opens the file and cannot drop it.
 */
export const DIRECTORY_SCHEMA_VERSION = 1 as const;

export interface ClowderRecord {
  id: string;
  name: string;
  description: string | null;
  /**
   * The Cattery whose org chart lists this Clowder, or null. Chosen when the
   * Clowder is created; cleared only when that Cattery is deleted (FR-7).
   */
  parentCatteryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatteryRecord {
  id: string;
  name: string;
  description: string | null;
  /** Optional company domain, such as `acme.com`. */
  domain: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClowderMembershipRecord {
  clowderId: string;
  catId: string;
  role: ClowderRole;
  status: MembershipStatus;
  /** Only a `temp` membership carries an end date; it is shown, never hidden or removed. */
  expiresAt: string | null;
  joinedAt: string;
  updatedAt: string;
}

export interface CatteryMembershipRecord {
  catteryId: string;
  catId: string;
  role: CatteryRole;
  status: CatteryMembershipStatus;
  joinedAt: string;
  updatedAt: string;
}

export interface DirectorySnapshot {
  schemaVersion: typeof DIRECTORY_SCHEMA_VERSION;
  updatedAt: string;
  clowders: ClowderRecord[];
  catteries: CatteryRecord[];
  clowderMemberships: ClowderMembershipRecord[];
  catteryMemberships: CatteryMembershipRecord[];
}
