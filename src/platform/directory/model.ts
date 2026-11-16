import { randomUUID } from 'node:crypto';

import { CoreNotFoundError, CoreValidationError } from '../../core/errors.js';
import type { MembershipStatus } from '../../shared/platform-contract.js';
import type {
  CatteryMembershipRecord,
  CatteryMembershipStatus,
  CatteryRecord,
  CatteryRole,
  ClowderMembershipRecord,
  ClowderRecord,
  ClowderRole,
  DirectorySnapshot,
} from './contracts.js';

export const DIRECTORY_NAME_MAX_LENGTH = 80;
export const DIRECTORY_DESCRIPTION_MAX_LENGTH = 500;
export const CATTERY_DOMAIN_MAX_LENGTH = 253;

export interface DirectoryMutationContext {
  now: Date;
  /** The Cats that exist. A new membership may only name one of them. */
  catIds: ReadonlySet<string>;
  createId?: (kind: 'clowder' | 'cattery') => string;
}

export interface ClowderMemberInput {
  catId?: unknown;
  role?: unknown;
  status?: unknown;
  expiresAt?: unknown;
}

export interface CatteryMemberInput {
  catId?: unknown;
  role?: unknown;
  status?: unknown;
}

export interface CreateClowderInput {
  name?: unknown;
  description?: unknown;
  parentCatteryId?: unknown;
  members?: unknown;
}

export interface UpdateClowderInput {
  name?: unknown;
  description?: unknown;
  parentCatteryId?: unknown;
}

export interface CreateCatteryInput {
  name?: unknown;
  description?: unknown;
  domain?: unknown;
  members?: unknown;
}

export interface UpdateCatteryInput {
  name?: unknown;
  description?: unknown;
  domain?: unknown;
}

const CLOWDER_ROLES: readonly ClowderRole[] = ['lead', 'member'];
const CATTERY_ROLES: readonly CatteryRole[] = ['owner', 'admin', 'member'];
const CLOWDER_STATUSES: readonly MembershipStatus[] = ['formal', 'temp', 'external'];
const CATTERY_STATUSES: readonly CatteryMembershipStatus[] = ['formal', 'external'];
const DOMAIN_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;

function invalid(message: string, code: string): CoreValidationError {
  return new CoreValidationError(message, code);
}

function readName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw invalid('Enter a name.', 'directory_name_required');
  if (name.length > DIRECTORY_NAME_MAX_LENGTH) {
    throw invalid(`A name can be at most ${DIRECTORY_NAME_MAX_LENGTH} characters.`, 'directory_name_too_long');
  }
  return name;
}

function readDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid('A description must be text.', 'directory_description_invalid');
  const description = value.trim();
  if (description.length > DIRECTORY_DESCRIPTION_MAX_LENGTH) {
    throw invalid(
      `A description can be at most ${DIRECTORY_DESCRIPTION_MAX_LENGTH} characters.`,
      'directory_description_too_long',
    );
  }
  return description || null;
}

function readDomain(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid('A domain must be text.', 'cattery_domain_invalid');
  const domain = value.trim().toLowerCase();
  if (!domain) return null;
  if (!DOMAIN_PATTERN.test(domain)) throw invalid('Enter a domain such as acme.com.', 'cattery_domain_invalid');
  return domain;
}

function readChoice<T extends string>(value: unknown, allowed: readonly T[], fallback: T, code: string): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw invalid(`Use one of: ${allowed.join(', ')}.`, code);
  }
  return value as T;
}

function readExpiresAt(value: unknown, status: MembershipStatus): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (status !== 'temp') throw invalid('Only a temporary member has an end date.', 'expires_at_requires_temp');
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(time)) throw invalid('Enter the end date as a date.', 'expires_at_invalid');
  return new Date(time).toISOString();
}

function readCatId(value: unknown, context: DirectoryMutationContext): string {
  if (typeof value !== 'string' || !context.catIds.has(value)) {
    throw invalid('That Cat does not exist.', 'cat_not_found');
  }
  return value;
}

function readList(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid('Members must be a list.', 'directory_members_invalid');
  return value;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid('Each member must be an object.', 'directory_members_invalid');
  }
  return value as Record<string, unknown>;
}

function touch(snapshot: DirectorySnapshot, nowIso: string): DirectorySnapshot {
  return { ...snapshot, updatedAt: nowIso };
}

function newId(kind: 'clowder' | 'cattery', context: DirectoryMutationContext): string {
  return context.createId?.(kind) ?? `${kind}-${randomUUID()}`;
}

function findClowder(snapshot: DirectorySnapshot, clowderId: string): ClowderRecord {
  const clowder = snapshot.clowders.find((candidate) => candidate.id === clowderId);
  if (!clowder) throw new CoreNotFoundError('That Clowder does not exist.', 'clowder_not_found');
  return clowder;
}

function findCattery(snapshot: DirectorySnapshot, catteryId: string): CatteryRecord {
  const cattery = snapshot.catteries.find((candidate) => candidate.id === catteryId);
  if (!cattery) throw new CoreNotFoundError('That Cattery does not exist.', 'cattery_not_found');
  return cattery;
}

function buildClowderMembership(
  clowderId: string,
  input: unknown,
  context: DirectoryMutationContext,
): ClowderMembershipRecord {
  const record = readRecord(input);
  const status = readChoice(record.status, CLOWDER_STATUSES, 'formal', 'membership_status_invalid');
  const nowIso = context.now.toISOString();
  return {
    clowderId,
    catId: readCatId(record.catId, context),
    role: readChoice(record.role, CLOWDER_ROLES, 'member', 'membership_role_invalid'),
    status,
    expiresAt: readExpiresAt(record.expiresAt, status),
    joinedAt: nowIso,
    updatedAt: nowIso,
  };
}

function buildCatteryMembership(
  catteryId: string,
  input: unknown,
  context: DirectoryMutationContext,
): CatteryMembershipRecord {
  const record = readRecord(input);
  if (record.status === 'temp') {
    throw invalid('A Cattery member is formal or external, never temporary.', 'cattery_temp_not_allowed');
  }
  const nowIso = context.now.toISOString();
  return {
    catteryId,
    catId: readCatId(record.catId, context),
    role: readChoice(record.role, CATTERY_ROLES, 'member', 'membership_role_invalid'),
    status: readChoice(record.status, CATTERY_STATUSES, 'formal', 'membership_status_invalid'),
    joinedAt: nowIso,
    updatedAt: nowIso,
  };
}

function readParentCatteryId(snapshot: DirectorySnapshot, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !snapshot.catteries.some((cattery) => cattery.id === value)) {
    throw invalid('That Cattery does not exist.', 'cattery_not_found');
  }
  return value;
}

function assertDistinctCats(catIds: string[]): void {
  if (new Set(catIds).size !== catIds.length) {
    throw invalid('A Cat can be listed only once.', 'duplicate_member');
  }
}

export function createClowder(
  snapshot: DirectorySnapshot,
  input: CreateClowderInput,
  context: DirectoryMutationContext,
): { snapshot: DirectorySnapshot; clowder: ClowderRecord } {
  const nowIso = context.now.toISOString();
  const clowder: ClowderRecord = {
    id: newId('clowder', context),
    name: readName(input.name),
    description: readDescription(input.description),
    parentCatteryId: readParentCatteryId(snapshot, input.parentCatteryId),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const memberships = readList(input.members).map((member) => buildClowderMembership(clowder.id, member, context));
  assertDistinctCats(memberships.map((member) => member.catId));
  return {
    clowder,
    snapshot: touch({
      ...snapshot,
      clowders: [...snapshot.clowders, clowder],
      clowderMemberships: [...snapshot.clowderMemberships, ...memberships],
    }, nowIso),
  };
}

export function updateClowder(
  snapshot: DirectorySnapshot,
  clowderId: string,
  patch: UpdateClowderInput,
  context: DirectoryMutationContext,
): { snapshot: DirectorySnapshot; clowder: ClowderRecord } {
  const current = findClowder(snapshot, clowderId);
  if (patch.parentCatteryId !== undefined && patch.parentCatteryId !== current.parentCatteryId) {
    throw invalid('A Clowder keeps the Cattery it was created in.', 'clowder_parent_fixed');
  }
  const nowIso = context.now.toISOString();
  const clowder: ClowderRecord = {
    ...current,
    ...(patch.name !== undefined ? { name: readName(patch.name) } : {}),
    ...(patch.description !== undefined ? { description: readDescription(patch.description) } : {}),
    updatedAt: nowIso,
  };
  return {
    clowder,
    snapshot: touch({
      ...snapshot,
      clowders: snapshot.clowders.map((candidate) => candidate.id === clowderId ? clowder : candidate),
    }, nowIso),
  };
}

/** Deleting a Clowder ends its memberships; every Cat stays. */
export function deleteClowder(
  snapshot: DirectorySnapshot,
  clowderId: string,
  context: DirectoryMutationContext,
): DirectorySnapshot {
  findClowder(snapshot, clowderId);
  return touch({
    ...snapshot,
    clowders: snapshot.clowders.filter((clowder) => clowder.id !== clowderId),
    clowderMemberships: snapshot.clowderMemberships.filter((member) => member.clowderId !== clowderId),
  }, context.now.toISOString());
}

export function createCattery(
  snapshot: DirectorySnapshot,
  input: CreateCatteryInput,
  context: DirectoryMutationContext,
): { snapshot: DirectorySnapshot; cattery: CatteryRecord } {
  const nowIso = context.now.toISOString();
  const cattery: CatteryRecord = {
    id: newId('cattery', context),
    name: readName(input.name),
    description: readDescription(input.description),
    domain: readDomain(input.domain),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const memberships = readList(input.members).map((member) => buildCatteryMembership(cattery.id, member, context));
  assertDistinctCats(memberships.map((member) => member.catId));
  return {
    cattery,
    snapshot: touch({
      ...snapshot,
      catteries: [...snapshot.catteries, cattery],
      catteryMemberships: [...snapshot.catteryMemberships, ...memberships],
    }, nowIso),
  };
}

export function updateCattery(
  snapshot: DirectorySnapshot,
  catteryId: string,
  patch: UpdateCatteryInput,
  context: DirectoryMutationContext,
): { snapshot: DirectorySnapshot; cattery: CatteryRecord } {
  const current = findCattery(snapshot, catteryId);
  const nowIso = context.now.toISOString();
  const cattery: CatteryRecord = {
    ...current,
    ...(patch.name !== undefined ? { name: readName(patch.name) } : {}),
    ...(patch.description !== undefined ? { description: readDescription(patch.description) } : {}),
    ...(patch.domain !== undefined ? { domain: readDomain(patch.domain) } : {}),
    updatedAt: nowIso,
  };
  return {
    cattery,
    snapshot: touch({
      ...snapshot,
      catteries: snapshot.catteries.map((candidate) => candidate.id === catteryId ? cattery : candidate),
    }, nowIso),
  };
}

/**
 * Deleting a Cattery ends its direct memberships. Its Clowders stay, with their
 * members, and simply no longer belong to a Cattery. Every Cat stays.
 */
export function deleteCattery(
  snapshot: DirectorySnapshot,
  catteryId: string,
  context: DirectoryMutationContext,
): DirectorySnapshot {
  findCattery(snapshot, catteryId);
  const nowIso = context.now.toISOString();
  return touch({
    ...snapshot,
    catteries: snapshot.catteries.filter((cattery) => cattery.id !== catteryId),
    catteryMemberships: snapshot.catteryMemberships.filter((member) => member.catteryId !== catteryId),
    clowders: snapshot.clowders.map((clowder) => clowder.parentCatteryId === catteryId
      ? { ...clowder, parentCatteryId: null, updatedAt: nowIso }
      : clowder),
  }, nowIso);
}

/** Adding a Cat that is already a member changes nothing (FR-14). */
export function addClowderMember(
  snapshot: DirectorySnapshot,
  clowderId: string,
  input: ClowderMemberInput,
  context: DirectoryMutationContext,
): { snapshot: DirectorySnapshot; membership: ClowderMembershipRecord; added: boolean } {
  findClowder(snapshot, clowderId);
  const existing = snapshot.clowderMemberships.find((member) =>
    member.clowderId === clowderId && member.catId === input.catId);
  if (existing) return { snapshot, membership: existing, added: false };
  const membership = buildClowderMembership(clowderId, input, context);
  return {
    membership,
    added: true,
    snapshot: touch({
      ...snapshot,
      clowderMemberships: [...snapshot.clowderMemberships, membership],
    }, context.now.toISOString()),
  };
}

function findClowderMembership(
  snapshot: DirectorySnapshot,
  clowderId: string,
  catId: string,
): ClowderMembershipRecord {
  findClowder(snapshot, clowderId);
  const membership = snapshot.clowderMemberships.find((member) =>
    member.clowderId === clowderId && member.catId === catId);
  if (!membership) throw new CoreNotFoundError('That Cat is not in this Clowder.', 'membership_not_found');
  return membership;
}

export function updateClowderMember(
  snapshot: DirectorySnapshot,
  clowderId: string,
  catId: string,
  patch: Omit<ClowderMemberInput, 'catId'>,
  context: DirectoryMutationContext,
): { snapshot: DirectorySnapshot; membership: ClowderMembershipRecord } {
  const current = findClowderMembership(snapshot, clowderId, catId);
  const status = readChoice(patch.status, CLOWDER_STATUSES, current.status, 'membership_status_invalid');
  const expiresAt = patch.expiresAt !== undefined
    ? readExpiresAt(patch.expiresAt, status)
    : status === 'temp' ? current.expiresAt : null;
  const nowIso = context.now.toISOString();
  const membership: ClowderMembershipRecord = {
    ...current,
    role: readChoice(patch.role, CLOWDER_ROLES, current.role, 'membership_role_invalid'),
    status,
    expiresAt,
    updatedAt: nowIso,
  };
  return {
    membership,
    snapshot: touch({
      ...snapshot,
      clowderMemberships: snapshot.clowderMemberships.map((member) => member === current ? membership : member),
    }, nowIso),
  };
}

export function removeClowderMember(
  snapshot: DirectorySnapshot,
  clowderId: string,
  catId: string,
  context: DirectoryMutationContext,
): DirectorySnapshot {
  const current = findClowderMembership(snapshot, clowderId, catId);
  return touch({
    ...snapshot,
    clowderMemberships: snapshot.clowderMemberships.filter((member) => member !== current),
  }, context.now.toISOString());
}

/**
 * Moves a Cat from one Clowder to another in one step, so a failure can never
 * leave it in neither. The Cat keeps its status and end date and joins as a
 * member. When it is already in the target, it only leaves the source.
 */
export function moveClowderMember(
  snapshot: DirectorySnapshot,
  input: { catId: string; fromClowderId: string; toClowderId: string },
  context: DirectoryMutationContext,
): { snapshot: DirectorySnapshot; membership: ClowderMembershipRecord } {
  if (input.fromClowderId === input.toClowderId) {
    throw invalid('Choose a different Clowder.', 'same_clowder');
  }
  const source = findClowderMembership(snapshot, input.fromClowderId, input.catId);
  findClowder(snapshot, input.toClowderId);
  const nowIso = context.now.toISOString();
  const existing = snapshot.clowderMemberships.find((member) =>
    member.clowderId === input.toClowderId && member.catId === input.catId);
  const membership: ClowderMembershipRecord = existing ?? {
    clowderId: input.toClowderId,
    catId: input.catId,
    role: 'member',
    status: source.status,
    expiresAt: source.expiresAt,
    joinedAt: nowIso,
    updatedAt: nowIso,
  };
  const remaining = snapshot.clowderMemberships.filter((member) => member !== source);
  return {
    membership,
    snapshot: touch({
      ...snapshot,
      clowderMemberships: existing ? remaining : [...remaining, membership],
    }, nowIso),
  };
}

export function addCatteryMember(
  snapshot: DirectorySnapshot,
  catteryId: string,
  input: CatteryMemberInput,
  context: DirectoryMutationContext,
): { snapshot: DirectorySnapshot; membership: CatteryMembershipRecord; added: boolean } {
  findCattery(snapshot, catteryId);
  const existing = snapshot.catteryMemberships.find((member) =>
    member.catteryId === catteryId && member.catId === input.catId);
  if (existing) return { snapshot, membership: existing, added: false };
  const membership = buildCatteryMembership(catteryId, input, context);
  return {
    membership,
    added: true,
    snapshot: touch({
      ...snapshot,
      catteryMemberships: [...snapshot.catteryMemberships, membership],
    }, context.now.toISOString()),
  };
}

function findCatteryMembership(
  snapshot: DirectorySnapshot,
  catteryId: string,
  catId: string,
): CatteryMembershipRecord {
  findCattery(snapshot, catteryId);
  const membership = snapshot.catteryMemberships.find((member) =>
    member.catteryId === catteryId && member.catId === catId);
  if (!membership) throw new CoreNotFoundError('That Cat is not in this Cattery.', 'membership_not_found');
  return membership;
}

export function updateCatteryMember(
  snapshot: DirectorySnapshot,
  catteryId: string,
  catId: string,
  patch: Omit<CatteryMemberInput, 'catId'>,
  context: DirectoryMutationContext,
): { snapshot: DirectorySnapshot; membership: CatteryMembershipRecord } {
  const current = findCatteryMembership(snapshot, catteryId, catId);
  if (patch.status === 'temp') {
    throw invalid('A Cattery member is formal or external, never temporary.', 'cattery_temp_not_allowed');
  }
  const nowIso = context.now.toISOString();
  const membership: CatteryMembershipRecord = {
    ...current,
    role: readChoice(patch.role, CATTERY_ROLES, current.role, 'membership_role_invalid'),
    status: readChoice(patch.status, CATTERY_STATUSES, current.status, 'membership_status_invalid'),
    updatedAt: nowIso,
  };
  return {
    membership,
    snapshot: touch({
      ...snapshot,
      catteryMemberships: snapshot.catteryMemberships.map((member) => member === current ? membership : member),
    }, nowIso),
  };
}

export function removeCatteryMember(
  snapshot: DirectorySnapshot,
  catteryId: string,
  catId: string,
  context: DirectoryMutationContext,
): DirectorySnapshot {
  const current = findCatteryMembership(snapshot, catteryId, catId);
  return touch({
    ...snapshot,
    catteryMemberships: snapshot.catteryMemberships.filter((member) => member !== current),
  }, context.now.toISOString());
}

/** A deleted Cat leaves every Clowder and Cattery. An archived Cat keeps its memberships. */
export function removeCatFromDirectory(
  snapshot: DirectorySnapshot,
  catId: string,
  now: Date,
): DirectorySnapshot {
  const clowderMemberships = snapshot.clowderMemberships.filter((member) => member.catId !== catId);
  const catteryMemberships = snapshot.catteryMemberships.filter((member) => member.catId !== catId);
  if (clowderMemberships.length === snapshot.clowderMemberships.length
    && catteryMemberships.length === snapshot.catteryMemberships.length) {
    return snapshot;
  }
  return touch({ ...snapshot, clowderMemberships, catteryMemberships }, now.toISOString());
}
