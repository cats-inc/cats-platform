import { useNavigate } from 'react-router-dom';

import type {
  PlatformLobbyCatterySummary,
  PlatformLobbyClowderSummary,
} from '../../../shared/platform-contract.js';
import {
  MyCatPlaceholderRow,
  type ConversationSidebarMyCatsPlaceholder,
} from '../productShell/ConversationSidebarMyCats.js';
import '../entities/directory.css';

type GroupSummary = PlatformLobbyClowderSummary | PlatformLobbyCatterySummary;

function byCreation(left: GroupSummary, right: GroupSummary): number {
  return left.createdAt.localeCompare(right.createdAt)
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id);
}

/**
 * The Directory sidebar's Clowder or Cattery rows, under their nav item, in
 * the cats rows' shape: a rounded-square initial instead of a cat avatar. With
 * none yet, the "New …" placeholder takes their place, as for cats.
 */
export function DirectorySidebarGroups({
  kind,
  groups,
  activeId,
  pathFor,
  placeholder,
}: {
  kind: 'clowder' | 'cattery';
  groups: readonly GroupSummary[];
  activeId: string | null;
  pathFor: (id: string) => string;
  placeholder: ConversationSidebarMyCatsPlaceholder;
}) {
  const navigate = useNavigate();
  const sorted = [...groups].sort(byCreation);
  return (
    <section className="myCatsSection myCatsSectionHeaderless">
      <div className="myCatsList">
        {sorted.length === 0 ? (
          <MyCatPlaceholderRow label={placeholder.label} onClick={placeholder.onClick} iconKind={placeholder.iconKind} />
        ) : null}
        {sorted.map((group) => {
          const active = group.id === activeId;
          return (
            <div
              key={group.id}
              className={active ? 'myCatRow myCatRowActive' : 'myCatRow'}
              onClick={() => navigate(pathFor(group.id))}
            >
              <button
                type="button"
                className={active ? 'myCatItem myCatItemActive' : 'myCatItem'}
                aria-current={active ? 'page' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(pathFor(group.id));
                }}
              >
                <span className={`myCatAvatarWrap directoryGroupAvatar directoryGroupAvatar--${kind} directoryGroupAvatar--small`} aria-hidden="true">
                  {group.name.trim().slice(0, 1)}
                </span>
                <span className="myCatName">{group.name}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
