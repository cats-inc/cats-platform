import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { buildClowderHomePath } from '../../../shared/directoryPaths.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import type {
  MembershipStatus,
  PlatformCatteryView,
  PlatformClowderView,
  PlatformDirectoryView,
  PlatformLobbyCatSummary,
} from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';
import type { DirectoryLoadState } from './directoryApi.js';
import {
  DirectoryCatAvatar,
  DirectoryGroupAvatar,
  DirectoryLoadError,
  MembershipStatusChip,
} from './directoryParts.js';
import './directory.css';

type Translate = ReturnType<typeof useI18n>['t'];

/**
 * Read-only lists for the Clowder and Cattery home pages. Changes happen in
 * the group's Settings tab, which is its canvas.
 */
export function DirectoryHomeState({
  state,
  onRetry,
  children,
}: {
  state: DirectoryLoadState;
  onRetry: () => void;
  children: (directory: PlatformDirectoryView) => ReactNode;
}) {
  if (state.status === 'loading') return <div className="directoryHomeBoot" />;
  if (state.status === 'error') return <DirectoryLoadError error={state.error} onRetry={onRetry} />;
  return <>{children(state.directory)}</>;
}

export interface DirectoryHomeRow {
  catId: string;
  cat: PlatformLobbyCatSummary;
  detail: string;
  status: MembershipStatus;
  expiresAt: string | null;
}

export function clowderHomeRows(
  clowder: PlatformClowderView,
  catLookup: Map<string, PlatformLobbyCatSummary>,
  t: Translate,
): DirectoryHomeRow[] {
  return clowder.members.filter((member) => catLookup.has(member.catId)).map((member) => ({
    catId: member.catId,
    cat: catLookup.get(member.catId)!,
    detail: member.role === 'lead' ? t(messageKeys.directoryRoleLead) : t(messageKeys.directoryRoleMember),
    status: member.status,
    expiresAt: member.expiresAt,
  }));
}

export function catteryMemberRows(
  cattery: PlatformCatteryView,
  catLookup: Map<string, PlatformLobbyCatSummary>,
  t: Translate,
): DirectoryHomeRow[] {
  return cattery.members.filter((member) => catLookup.has(member.catId)).map((member) => ({
    catId: member.catId,
    cat: catLookup.get(member.catId)!,
    detail: t(member.role === 'owner'
      ? messageKeys.directoryRoleOwner
      : member.role === 'admin' ? messageKeys.directoryRoleAdmin : messageKeys.directoryRoleMember),
    status: member.status,
    expiresAt: null,
  }));
}

/** SPEC-103 FR-10: every Cat reachable from the Cattery once, saying where it is reached from. */
export function catteryCatRows(
  cattery: PlatformCatteryView,
  directory: PlatformDirectoryView,
  catLookup: Map<string, PlatformLobbyCatSummary>,
  t: Translate,
): DirectoryHomeRow[] {
  const rows = new Map<string, DirectoryHomeRow>();
  for (const member of cattery.members) {
    const cat = catLookup.get(member.catId);
    if (cat) {
      rows.set(member.catId, {
        catId: member.catId, cat, detail: t(messageKeys.catteryHomeDirectMember), status: member.status, expiresAt: null,
      });
    }
  }
  for (const clowder of directory.clowders.filter((candidate) => candidate.parentCatteryId === cattery.id)) {
    for (const member of clowder.members) {
      const cat = catLookup.get(member.catId);
      if (!cat || rows.has(member.catId)) continue;
      rows.set(member.catId, {
        catId: member.catId,
        cat,
        detail: t(messageKeys.catteryHomeViaClowder, { group: clowder.name }),
        status: member.status,
        expiresAt: member.expiresAt,
      });
    }
  }
  return [...rows.values()];
}

export function DirectoryHomeCatList({ rows, empty }: { rows: DirectoryHomeRow[]; empty: string }) {
  if (rows.length === 0) return <p className="directoryHint directoryHomeEmpty">{empty}</p>;
  return (
    <ul className="directoryMemberList directoryHomeList">
      {rows.map((row) => (
        <li key={row.catId} className="directoryMemberRow">
          <DirectoryCatAvatar cat={row.cat} />
          <span className="directoryMemberText">
            <span className="directoryMemberName">{row.cat.name}</span>
            <span className="directoryMemberRole">{row.detail}</span>
          </span>
          {row.status !== 'formal' ? <MembershipStatusChip status={row.status} expiresAt={row.expiresAt} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function DirectoryHomeClowderList({ clowders, empty }: { clowders: PlatformClowderView[]; empty: string }) {
  const { t } = useI18n();
  if (clowders.length === 0) return <p className="directoryHint directoryHomeEmpty">{empty}</p>;
  return (
    <ul className="directoryMemberList directoryHomeList">
      {clowders.map((clowder) => (
        <li key={clowder.id} className="directoryMemberRow">
          <DirectoryGroupAvatar name={clowder.name} kind="clowder" size="small" />
          <Link className="directoryMemberText directoryHomeLink" to={buildClowderHomePath(clowder.id)}>
            <span className="directoryMemberName">{clowder.name}</span>
            <span className="directoryMemberRole">
              {t(messageKeys.clowdersCanvasMoveMemberCount, { count: String(clowder.members.length) })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
