import { Link } from 'react-router-dom';

import { buildCatteryHomePath, buildClowderHomePath } from '../../../shared/directoryPaths.js';
import { messageKeys, type MessageLocale } from '../../../shared/i18n/index.js';
import type {
  CatteryRole,
  ClowderRole,
  MembershipStatus,
  PlatformDirectoryView,
} from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';
import type { DirectoryLoadState } from './directoryApi.js';
import {
  DirectoryGroupAvatar,
  MembershipStatusChip,
  describeMembershipStatus,
  directoryLoadErrorMessage,
} from './directoryParts.js';
import './directory.css';

type Translate = ReturnType<typeof useI18n>['t'];

export interface CatMembershipTag {
  kind: 'clowder' | 'cattery';
  id: string;
  name: string;
  href: string;
  role: string;
  status: MembershipStatus;
  expiresAt: string | null;
  /** The whole membership in words, for the link's name and tooltip. */
  label: string;
}

function clowderRoleLabel(t: Translate, role: ClowderRole): string {
  return t(role === 'lead' ? messageKeys.directoryRoleLead : messageKeys.directoryRoleMember);
}

function catteryRoleLabel(t: Translate, role: CatteryRole): string {
  if (role === 'owner') return t(messageKeys.directoryRoleOwner);
  if (role === 'admin') return t(messageKeys.directoryRoleAdmin);
  return t(messageKeys.directoryRoleMember);
}

/**
 * The groups a Cat is in, Catteries first, each in Directory order. A
 * Cattery is listed only for the Cat's own membership: being in one of its
 * Clowders does not make the Cat a member of it (SPEC-103 FR-16).
 */
export function catMembershipTags(
  directory: PlatformDirectoryView,
  catId: string,
  t: Translate,
  locale: MessageLocale,
  now: Date,
): CatMembershipTag[] {
  const tags: CatMembershipTag[] = [];
  for (const cattery of directory.catteries) {
    const member = cattery.members.find((entry) => entry.catId === catId);
    if (!member) continue;
    const role = catteryRoleLabel(t, member.role);
    const status = describeMembershipStatus(t, locale, member.status, null, now).label;
    tags.push({
      kind: 'cattery',
      id: cattery.id,
      name: cattery.name,
      href: buildCatteryHomePath(cattery.id),
      role,
      status: member.status,
      expiresAt: null,
      label: t(messageKeys.catProfileMembershipsCatteryLabel, { name: cattery.name, role, status }),
    });
  }
  const catteryNames = new Map(directory.catteries.map((cattery) => [cattery.id, cattery.name]));
  for (const clowder of directory.clowders) {
    const member = clowder.members.find((entry) => entry.catId === catId);
    if (!member) continue;
    const role = clowderRoleLabel(t, member.role);
    const status = describeMembershipStatus(t, locale, member.status, member.expiresAt, now).label;
    const catteryName = clowder.parentCatteryId ? catteryNames.get(clowder.parentCatteryId) : undefined;
    tags.push({
      kind: 'clowder',
      id: clowder.id,
      name: clowder.name,
      href: buildClowderHomePath(clowder.id),
      role,
      status: member.status,
      expiresAt: member.expiresAt,
      label: catteryName
        ? t(messageKeys.catProfileMembershipsClowderInCatteryLabel, { name: clowder.name, catteryName, role, status })
        : t(messageKeys.catProfileMembershipsClowderLabel, { name: clowder.name, role, status }),
    });
  }
  return tags;
}

/**
 * A Cat's Clowders and Catteries under its name on the profile page, each
 * linking to the group's home. Read only: a group's Settings tab changes
 * its members.
 *
 * No Cat has to be in a group, so a Cat in none shows nothing rather than
 * a prompt to join one. A failed read says so and offers a retry, so it
 * never reads as "in no groups".
 */
export function CatMemberships({
  state,
  catId,
  onRetry,
  now = new Date(),
}: {
  state: DirectoryLoadState;
  catId: string;
  onRetry: () => void;
  now?: Date;
}) {
  const { t, locale } = useI18n();
  if (state.status === 'loading') return null;
  if (state.status === 'error') {
    return (
      <p className="catMembershipsError" role="alert">
        <span>{directoryLoadErrorMessage(t, state.error)}</span>
        <button type="button" className="catMembershipsRetry" onClick={onRetry}>
          {t(messageKeys.directoryRetryAction)}
        </button>
      </p>
    );
  }
  const tags = catMembershipTags(state.directory, catId, t, locale, now);
  if (tags.length === 0) return null;
  return (
    <ul className="catMemberships" aria-label={t(messageKeys.catProfileMembershipsAriaLabel)}>
      {tags.map((tag) => (
        <li key={`${tag.kind}:${tag.id}`}>
          <Link
            className={`catMembershipTag catMembershipTag--${tag.kind}`}
            to={tag.href}
            aria-label={tag.label}
            title={tag.label}
          >
            <DirectoryGroupAvatar name={tag.name} kind={tag.kind} size="tiny" />
            <span className="catMembershipName">{tag.name}</span>
            <span className="catMembershipRole">{tag.role}</span>
            {tag.status !== 'formal' ? <MembershipStatusChip status={tag.status} expiresAt={tag.expiresAt} now={now} /> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
