import { useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog, useConfirmDialog } from '../../../design/components/ConfirmDialog.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  SettingsActionBar,
  SettingsSection,
  SettingsSectionHeader,
  SettingsSubSection,
} from '../../../design/components/settings/index.js';
import {
  CATTERIES_DIRECTORY_NEW_PATH,
  CATTERIES_DIRECTORY_PATH,
  CLOWDERS_DIRECTORY_NEW_PATH,
  buildCatteryHomePath,
  buildCatterySettingsPath,
  buildClowderSettingsPath,
} from '../../../shared/directoryPaths.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import type {
  CatteryMembershipStatus,
  CatteryRole,
  PlatformCatteryMemberView,
  PlatformCatteryView,
  PlatformClowderView,
  PlatformDirectoryView,
  PlatformHostEnvelope,
  PlatformLobbyCatSummary,
} from '../../../shared/platform-contract.js';
import '../../../products/shared/renderer/styles/settings.css';
import { useI18n } from '../i18n/index.js';
import { directoryApi, useDirectory, type DirectoryRequestError } from './directoryApi.js';
import {
  AddCatPopover,
  DirectoryCatAvatar,
  DirectoryGroupAvatar,
  DirectoryLoadError,
  DirectorySegmented,
  MembershipStatusChip,
  directoryErrorMessage,
  useCatLookup,
  useDismiss,
  type DirectoryCanvasActions,
} from './directoryParts.js';
import { MoveMemberDialog } from './MoveMemberDialog.js';
import './directory.css';

type CatteryFilter = 'all' | CatteryMembershipStatus;
type DropOutcome = 'move' | 'add' | 'join' | 'leave' | 'already';

/** macOS copies with Option while dragging; Windows and Linux with Ctrl. */
function copiesWithOption(): boolean {
  const nav = globalThis.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  return /mac/iu.test(nav?.userAgentData?.platform ?? nav?.platform ?? '');
}

function roleLabelKey(role: CatteryRole) {
  if (role === 'owner') return messageKeys.directoryRoleOwner;
  if (role === 'admin') return messageKeys.directoryRoleAdmin;
  return messageKeys.directoryRoleMember;
}

function CatteryStrip({
  directory,
  selectedId,
  creating,
}: {
  directory: PlatformDirectoryView;
  selectedId: string | null;
  creating: boolean;
}) {
  const { t } = useI18n();
  return (
    <nav className="directoryStrip" aria-label={t(messageKeys.catteriesCanvasStripAria)}>
      <div className="directoryStripItems">
        {directory.catteries.map((cattery) => (
          <Link
            key={cattery.id}
            to={buildCatterySettingsPath(cattery.id)}
            className={cattery.id === selectedId ? 'directoryStripItem directoryStripItemActive' : 'directoryStripItem'}
            aria-current={cattery.id === selectedId ? 'page' : undefined}
            aria-label={cattery.name}
            data-tooltip={cattery.name}
          >
            <DirectoryGroupAvatar name={cattery.name} kind="cattery" />
          </Link>
        ))}
      </div>
      <Link
        to={CATTERIES_DIRECTORY_NEW_PATH}
        className={creating ? 'directoryStripNew directoryStripItemActive' : 'directoryStripNew'}
        aria-label={t(messageKeys.entitiesSidebarNewCattery)}
        aria-current={creating ? 'page' : undefined}
        data-tooltip={t(messageKeys.entitiesSidebarNewCattery)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>
    </nav>
  );
}

function CatPicker({
  cats,
  selected,
  onChange,
}: {
  cats: readonly PlatformLobbyCatSummary[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  if (cats.length === 0) return <p className="directoryHint">{t(messageKeys.directoryNoCats)}</p>;
  return (
    <div className="directoryCatPicker">
      {cats.map((cat) => {
        const pressed = selected.includes(cat.id);
        return (
          <button
            key={cat.id}
            type="button"
            className="directoryCatPick"
            aria-pressed={pressed}
            onClick={() => onChange(pressed ? selected.filter((id) => id !== cat.id) : [...selected, cat.id])}
          >
            <DirectoryCatAvatar cat={cat} size="small" />
            <span>{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function CatteryCreateCard({
  directory,
  cats,
  actions,
  canCancel,
}: {
  directory: PlatformDirectoryView;
  cats: readonly PlatformLobbyCatSummary[];
  actions: DirectoryCanvasActions;
  canCancel: boolean;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!name.trim() || actions.pending) return;
    const before = new Set(directory.catteries.map((cattery) => cattery.id));
    try {
      const next = await actions.run(() => directoryApi.createCattery({
        name: name.trim(),
        domain: domain.trim() || null,
        description: description.trim() || null,
        members: memberIds.map((catId) => ({ catId })),
      }));
      const created = next.catteries.find((cattery) => !before.has(cattery.id));
      navigate(created ? buildCatterySettingsPath(created.id) : CATTERIES_DIRECTORY_PATH, { replace: true });
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  return (
    <SettingsSection
      className="catsDetailCard"
      header={
        <SettingsSectionHeader
          title={t(messageKeys.entitiesSidebarNewCattery)}
          status={
            <SettingsActionBar>
              {canCancel ? (
                <button type="button" className="secondaryButton" onClick={() => navigate(CATTERIES_DIRECTORY_PATH)} disabled={actions.pending}>
                  {t(messageKeys.sharedCatsCreateCancel)}
                </button>
              ) : null}
              <button
                type="button"
                className="primaryButton"
                disabled={!name.trim() || actions.pending}
                onClick={() => { void submit(); }}
              >
                {t(messageKeys.catteriesCanvasSaveAction)}
              </button>
            </SettingsActionBar>
          }
        />
      }
    >
      <form className="catsDetailBody" onSubmit={(event) => { void submit(event); }}>
        <div className="catsDetailColumn">
          <SettingsSubSection headerless className="catsSubCard">
            <label className="fieldLabel">
              <span>{t(messageKeys.directoryNameLabel)}</span>
              <input className="textInput" value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="fieldLabel">
              <span>{t(messageKeys.catteriesCanvasDomainLabel)}</span>
              <input className="textInput" value={domain} placeholder="acme.com" onChange={(event) => setDomain(event.target.value)} />
            </label>
            <label className="fieldLabel">
              <span>{t(messageKeys.directoryDescriptionLabel)}</span>
              <textarea
                className="textInput directoryTextarea"
                value={description}
                maxLength={500}
                rows={3}
                placeholder={t(messageKeys.catteriesCanvasDescriptionPlaceholder)}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </SettingsSubSection>
        </div>
        <div className="catsDetailColumn">
          <SettingsSubSection headerless className="catsSubCard">
            <div className="directorySubHeader">
              <h3 className="directorySubHeading">{t(messageKeys.catteriesCanvasDirectMembersHeading)}</h3>
              <span className="directoryHint">{t(messageKeys.clowdersCanvasInitialMembersHint)}</span>
            </div>
            <p className="directoryHint">{t(messageKeys.catteriesCanvasDirectMembersHint)}</p>
            <CatPicker cats={cats} selected={memberIds} onChange={setMemberIds} />
          </SettingsSubSection>
        </div>
      </form>
    </SettingsSection>
  );
}

function CatteryIdentityCard({ cattery, actions }: { cattery: PlatformCatteryView; actions: DirectoryCanvasActions }) {
  const { t } = useI18n();
  const [name, setName] = useState(cattery.name);
  const [domain, setDomain] = useState(cattery.domain ?? '');
  const [description, setDescription] = useState(cattery.description ?? '');

  async function save(patch: { name?: string; domain?: string | null; description?: string | null }) {
    try {
      await actions.run(() => directoryApi.updateCattery(cattery.id, patch));
    } catch (error) {
      setName(cattery.name);
      setDomain(cattery.domain ?? '');
      setDescription(cattery.description ?? '');
      actions.fail(error as DirectoryRequestError);
    }
  }

  return (
    <SettingsSubSection headerless className="catsSubCard">
      <div className="directoryIdentityRow">
        <DirectoryGroupAvatar name={name || cattery.name} kind="cattery" />
      </div>
      <label className="fieldLabel">
        <span>{t(messageKeys.directoryNameLabel)}</span>
        <input
          className="textInput"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            const next = name.trim();
            if (!next) setName(cattery.name);
            else if (next !== cattery.name) void save({ name: next });
          }}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
      </label>
      <label className="fieldLabel">
        <span>{t(messageKeys.catteriesCanvasDomainLabel)}</span>
        <input
          className="textInput"
          value={domain}
          placeholder="acme.com"
          onChange={(event) => setDomain(event.target.value)}
          onBlur={() => {
            const next = domain.trim() || null;
            if (next !== cattery.domain) void save({ domain: next });
          }}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
      </label>
      <label className="fieldLabel">
        <span>{t(messageKeys.directoryDescriptionLabel)}</span>
        <textarea
          className="textInput directoryTextarea"
          value={description}
          maxLength={500}
          rows={3}
          placeholder={t(messageKeys.catteriesCanvasDescriptionPlaceholder)}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => {
            const next = description.trim() || null;
            if (next !== cattery.description) void save({ description: next });
          }}
        />
      </label>
    </SettingsSubSection>
  );
}

function CatteryMemberRow({
  cattery,
  member,
  cat,
  actions,
}: {
  cattery: PlatformCatteryView;
  member: PlatformCatteryMemberView;
  cat: PlatformLobbyCatSummary;
  actions: DirectoryCanvasActions;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  async function update(patch: { role?: CatteryRole; status?: CatteryMembershipStatus }) {
    try {
      await actions.run(() => directoryApi.updateCatteryMember(cattery.id, member.catId, patch));
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  async function remove() {
    setOpen(false);
    try {
      await actions.run(() => directoryApi.removeCatteryMember(cattery.id, member.catId));
      actions.toast(t(messageKeys.directoryToastRemoved, { cat: cat.name, group: cattery.name }));
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  return (
    <li className="directoryMemberRow" ref={ref}>
      <DirectoryCatAvatar cat={cat} />
      <span className="directoryMemberText">
        <span className="directoryMemberName">{cat.name}</span>
        <span className="directoryMemberRole">{t(roleLabelKey(member.role))}</span>
      </span>
      {member.status !== 'formal' ? <MembershipStatusChip status={member.status} /> : null}
      <button
        type="button"
        className="directoryMoreButton"
        aria-label={t(messageKeys.directoryMemberMoreAria, { name: cat.name })}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="12.5" cy="8" r="1.3" />
        </svg>
      </button>
      {open ? (
        <div className="accountMenu accountMenu--below accountMenu--alignEnd directoryMenu" role="menu">
          <p className="directoryMenuCaption">{t(messageKeys.catteriesCanvasMemberRoleHeading)}</p>
          <DirectorySegmented<CatteryRole>
            label={t(messageKeys.catteriesCanvasMemberRoleHeading)}
            value={member.role}
            disabled={actions.pending}
            options={[
              { value: 'owner', label: t(messageKeys.directoryRoleOwner) },
              { value: 'admin', label: t(messageKeys.directoryRoleAdmin) },
              { value: 'member', label: t(messageKeys.directoryRoleMember) },
            ]}
            onChange={(role) => { void update({ role }); }}
          />
          <p className="directoryMenuCaption">{t(messageKeys.catteriesCanvasMemberStatusHeading)}</p>
          <DirectorySegmented<CatteryMembershipStatus>
            label={t(messageKeys.catteriesCanvasMemberStatusHeading)}
            value={member.status}
            disabled={actions.pending}
            options={[
              { value: 'formal', label: t(messageKeys.directoryStatusFormal) },
              { value: 'external', label: t(messageKeys.directoryStatusExternal) },
            ]}
            onChange={(status) => { void update({ status }); }}
          />
          <div className="accountMenuDivider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="accountMenuItem directoryMenuItem directoryMenuItemDanger"
            disabled={actions.pending}
            onClick={() => { void remove(); }}
          >
            {t(messageKeys.catteriesCanvasMemberRemove)}
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Direct members. The list starts on formal members, the org chart's own view (SPEC-103 FR-20). */
function CatteryMembersCard({
  cattery,
  cats,
  catLookup,
  actions,
}: {
  cattery: PlatformCatteryView;
  cats: readonly PlatformLobbyCatSummary[];
  catLookup: Map<string, PlatformLobbyCatSummary>;
  actions: DirectoryCanvasActions;
}) {
  const { t } = useI18n();
  const members = cattery.members.filter((member) => catLookup.has(member.catId));
  const [filter, setFilter] = useState<CatteryFilter>(() =>
    members.some((member) => member.status === 'formal') || members.length === 0 ? 'formal' : 'all');
  const count = (status: CatteryFilter) => members.filter((member) => status === 'all' || member.status === status).length;
  const shown = members.filter((member) => filter === 'all' || member.status === filter);

  async function addCat(cat: PlatformLobbyCatSummary) {
    try {
      await actions.run(() => directoryApi.addCatteryMember(cattery.id, { catId: cat.id }));
      actions.toast(t(messageKeys.directoryToastAdded, { cat: cat.name, group: cattery.name }));
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  return (
    <SettingsSubSection headerless className="catsSubCard directoryMembersCard">
      <div className="directorySubHeader">
        <div>
          <h3 className="directorySubHeading">
            {t(messageKeys.catteriesCanvasDirectMembersHeading)} <span className="directoryCount">{members.length}</span>
          </h3>
          <p className="directoryHint">{t(messageKeys.catteriesCanvasDirectMembersHint)}</p>
        </div>
        <AddCatPopover
          memberIds={new Set(cattery.members.map((member) => member.catId))}
          cats={cats}
          pending={actions.pending}
          onAdd={(cat) => { void addCat(cat); }}
        />
      </div>
      {members.length > 0 ? (
        <div className="directoryFilters" role="group" aria-label={t(messageKeys.directoryFilterAria)}>
          {([
            ['formal', t(messageKeys.directoryStatusFormal)],
            ['external', t(messageKeys.directoryStatusExternal)],
            ['all', t(messageKeys.directoryFilterAll)],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="directoryFilter"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label} <span className="directoryCount">{count(value)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {members.length === 0 ? (
        <p className="directoryHint">{t(messageKeys.catteriesCanvasEmptyDirectMembers)}</p>
      ) : shown.length === 0 ? (
        <p className="directoryHint">{t(messageKeys.directoryEmptyFilter)}</p>
      ) : (
        <ul className="directoryMemberList directoryMemberGrid">
          {shown.map((member) => (
            <CatteryMemberRow
              key={member.catId}
              cattery={cattery}
              member={member}
              cat={catLookup.get(member.catId)!}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </SettingsSubSection>
  );
}

interface BoardCard {
  catId: string;
  cat: PlatformLobbyCatSummary;
  lead: boolean;
  status: PlatformCatteryMemberView['status'] | PlatformClowderView['members'][number]['status'];
  expiresAt: string | null;
}

/**
 * The Cattery's org chart: a lane for direct members in none of its Clowders,
 * then one column per Clowder. Dragging moves a Cat between Clowders (one
 * request), the copy key also adds it, and the lane takes it out of its
 * Clowder. Every card's ⋯ opens the same move as a dialog for keyboards.
 */
function OrgChart({
  cattery,
  directory,
  catLookup,
  actions,
}: {
  cattery: PlatformCatteryView;
  directory: PlatformDirectoryView;
  catLookup: Map<string, PlatformLobbyCatSummary>;
  actions: DirectoryCanvasActions;
}) {
  const { t } = useI18n();
  const optionCopies = copiesWithOption();
  const [drag, setDrag] = useState<{ catId: string; from: string | null } | null>(null);
  const [over, setOver] = useState<{ target: string | null; copy: boolean } | null>(null);
  const [dialog, setDialog] = useState<{ catId: string; from: string | null } | null>(null);
  const clowders = directory.clowders.filter((clowder) => clowder.parentCatteryId === cattery.id);
  const inClowder = new Set(clowders.flatMap((clowder) => clowder.members.map((member) => member.catId)));
  const directStatus = new Map(cattery.members.map((member) => [member.catId, member.status]));
  const lane: BoardCard[] = cattery.members
    .filter((member) => catLookup.has(member.catId) && !inClowder.has(member.catId))
    .map((member) => ({ catId: member.catId, cat: catLookup.get(member.catId)!, lead: false, status: member.status, expiresAt: null }));
  const columnCards = (clowder: PlatformClowderView): BoardCard[] => clowder.members
    .filter((member) => catLookup.has(member.catId))
    .map((member) => ({
      catId: member.catId,
      cat: catLookup.get(member.catId)!,
      lead: member.role === 'lead',
      status: member.status,
      expiresAt: member.expiresAt,
    }));

  const copyPressed = (event: DragEvent) => (optionCopies ? event.altKey : event.ctrlKey);

  function outcome(target: string | null, copy: boolean): DropOutcome | null {
    if (!drag || target === drag.from) return null;
    if (target === null) return drag.from ? 'leave' : null;
    const clowder = clowders.find((candidate) => candidate.id === target);
    if (!clowder) return null;
    if (clowder.members.some((member) => member.catId === drag.catId)) return 'already';
    if (drag.from === null) return 'join';
    return copy ? 'add' : 'move';
  }

  async function apply(current: { catId: string; from: string | null }, target: string | null, result: DropOutcome) {
    const cat = catLookup.get(current.catId);
    const from = clowders.find((clowder) => clowder.id === current.from) ?? null;
    const to = clowders.find((clowder) => clowder.id === target) ?? null;
    if (!cat) return;
    try {
      if (result === 'leave' && from) {
        await actions.run(() => directoryApi.removeClowderMember(from.id, cat.id));
        actions.toast(t(messageKeys.directoryToastRemoved, { cat: cat.name, group: from.name }));
      } else if (result === 'move' && from && to) {
        await actions.run(() => directoryApi.moveClowderMember(from.id, cat.id, to.id));
        actions.toast(t(messageKeys.clowdersCanvasToastMoved, { cat: cat.name, group: to.name }));
      } else if ((result === 'add' || result === 'join') && to) {
        const source = from?.members.find((member) => member.catId === cat.id);
        const status = source?.status ?? (directStatus.get(cat.id) === 'external' ? 'external' : 'formal');
        await actions.run(() => directoryApi.addClowderMember(to.id, {
          catId: cat.id,
          status,
          expiresAt: status === 'temp' ? source?.expiresAt ?? null : null,
        }));
        actions.toast(t(messageKeys.directoryToastAdded, { cat: cat.name, group: to.name }));
      }
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  function columnHandlers(target: string | null) {
    return {
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        const copy = copyPressed(event);
        const result = outcome(target, copy);
        if (result && result !== 'already') {
          event.preventDefault();
          event.dataTransfer.dropEffect = result === 'add' || result === 'join' ? 'copy' : 'move';
        }
        if (over?.target !== target || over.copy !== copy) setOver({ target, copy });
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const current = drag;
        const result = outcome(target, copyPressed(event));
        setDrag(null);
        setOver(null);
        if (current && result && result !== 'already') void apply(current, target, result);
      },
    };
  }

  function dropText(result: DropOutcome, name: string): string {
    if (result === 'move') return t(messageKeys.catteriesCanvasDropMove, { group: name });
    if (result === 'add') return t(messageKeys.catteriesCanvasDropAdd, { group: name });
    if (result === 'join') return t(messageKeys.catteriesCanvasDropJoin, { group: name });
    if (result === 'leave') return t(messageKeys.catteriesCanvasDropLeave, { group: name });
    return t(messageKeys.catteriesCanvasDropAlready);
  }

  function renderCards(cards: BoardCard[], from: string | null) {
    return cards.map((card) => (
      <div
        key={card.catId}
        className="directoryBoardCard"
        draggable={!actions.pending}
        data-dragging={drag?.catId === card.catId && drag.from === from ? 'true' : undefined}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'copyMove';
          event.dataTransfer.setData('text/plain', card.catId);
          setDrag({ catId: card.catId, from });
        }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
      >
        <DirectoryCatAvatar cat={card.cat} size="small" />
        <span className="directoryBoardCardName">{card.cat.name}</span>
        {card.lead ? <span className="directoryBoardLead">{t(messageKeys.directoryRoleLead)}</span> : null}
        {card.status !== 'formal' ? <MembershipStatusChip status={card.status} expiresAt={card.expiresAt} compact /> : null}
        <button
          type="button"
          className="directoryMoreButton directoryMoreButtonSmall"
          aria-label={t(messageKeys.catteriesCanvasCardMoreAria, { name: card.cat.name })}
          onClick={() => setDialog({ catId: card.catId, from })}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.3" />
            <circle cx="8" cy="8" r="1.3" />
            <circle cx="12.5" cy="8" r="1.3" />
          </svg>
        </button>
      </div>
    ));
  }

  function slot(target: string | null, name: string) {
    if (!drag || over?.target !== target) return null;
    const result = outcome(target, over.copy);
    if (!result) return null;
    return (
      <div className={result === 'already' ? 'directoryBoardSlot directoryBoardSlotRefused' : 'directoryBoardSlot'}>
        {dropText(result, name)}
      </div>
    );
  }

  const columnState = (target: string | null) => {
    if (!drag || over?.target !== target) return undefined;
    const result = outcome(target, over.copy);
    return result === 'already' ? 'refused' : result ? 'accepting' : undefined;
  };
  const dialogSource = dialog?.from ? clowders.find((clowder) => clowder.id === dialog.from) ?? null : null;
  const dialogCat = dialog ? catLookup.get(dialog.catId) ?? null : null;

  return (
    <SettingsSubSection headerless className="catsSubCard">
      <div className="directorySubHeader">
        <div>
          <h3 className="directorySubHeading">{t(messageKeys.catteriesCanvasOrgChartHeading)}</h3>
          <p className="directoryHint">
            {t(messageKeys.catteriesCanvasOrgChartHint, { key: optionCopies ? 'Option' : 'Ctrl' })}
          </p>
        </div>
        <Link className="secondaryButton directorySmallButton" to={`${CLOWDERS_DIRECTORY_NEW_PATH}?cattery=${encodeURIComponent(cattery.id)}`}>
          {t(messageKeys.entitiesSidebarNewClowder)}
        </Link>
      </div>
      <div className="directoryBoard">
        <div
          className="directoryBoardColumn directoryBoardLane"
          data-drop={columnState(null)}
          aria-label={t(messageKeys.catteriesCanvasLaneTitle)}
          {...columnHandlers(null)}
        >
          <div className="directoryBoardHeader">
            <span className="directoryBoardTitle">{t(messageKeys.catteriesCanvasLaneTitle)}</span>
            <span className="directoryCount">{lane.length}</span>
          </div>
          {renderCards(lane, null)}
          {lane.length === 0 && !(drag && over?.target === null) ? (
            <p className="directoryHint">{t(messageKeys.catteriesCanvasLaneEmpty)}</p>
          ) : null}
          {slot(null, clowders.find((clowder) => clowder.id === drag?.from)?.name ?? '')}
        </div>
        {clowders.map((clowder) => {
          const cards = columnCards(clowder);
          return (
            <div
              key={clowder.id}
              className="directoryBoardColumn"
              data-drop={columnState(clowder.id)}
              aria-label={clowder.name}
              {...columnHandlers(clowder.id)}
            >
              <div className="directoryBoardHeader">
                <DirectoryGroupAvatar name={clowder.name} kind="clowder" size="small" />
                <Link className="directoryBoardTitle directoryBoardTitleLink" to={buildClowderSettingsPath(clowder.id)}>
                  {clowder.name}
                </Link>
                <span className="directoryCount">{cards.length}</span>
              </div>
              {renderCards(cards, clowder.id)}
              {slot(clowder.id, clowder.name)}
            </div>
          );
        })}
        <Link
          className="directoryBoardAdd"
          to={`${CLOWDERS_DIRECTORY_NEW_PATH}?cattery=${encodeURIComponent(cattery.id)}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t(messageKeys.catteriesCanvasNewClowder, { name: cattery.name })}
        </Link>
      </div>
      {dialog && dialogCat ? (
        <MoveMemberDialog
          directory={directory}
          source={dialogSource}
          cat={dialogCat}
          initialMode="move"
          status={directStatus.get(dialog.catId) === 'external' ? 'external' : 'formal'}
          actions={actions}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </SettingsSubSection>
  );
}

function CatteryDetailCard({
  cattery,
  directory,
  cats,
  catLookup,
  actions,
  onDelete,
}: {
  cattery: PlatformCatteryView;
  directory: PlatformDirectoryView;
  cats: readonly PlatformLobbyCatSummary[];
  catLookup: Map<string, PlatformLobbyCatSummary>;
  actions: DirectoryCanvasActions;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <SettingsSection
      className="catsDetailCard"
      header={
        <SettingsSectionHeader
          title={
            <>
              {cattery.name}
              {cattery.domain ? <span className="directoryChip directoryChip--domain">{cattery.domain}</span> : null}
            </>
          }
          status={
            <SettingsActionBar>
              <Link className="secondaryButton" to={buildCatteryHomePath(cattery.id)}>
                {t(messageKeys.entityCanvasOpenCatteryAction)}
              </Link>
              <button type="button" className="secondaryButton" disabled={actions.pending} onClick={onDelete}>
                {t(messageKeys.sharedSettingsCatsDeleteLabel)}
              </button>
            </SettingsActionBar>
          }
        />
      }
    >
      <div className="directoryCatteryBody">
        <div className="catsDetailBody directoryDetailBody">
          <div className="catsDetailColumn">
            <CatteryIdentityCard key={cattery.id} cattery={cattery} actions={actions} />
          </div>
          <div className="catsDetailColumn">
            <CatteryMembersCard key={cattery.id} cattery={cattery} cats={cats} catLookup={catLookup} actions={actions} />
          </div>
        </div>
        <OrgChart key={cattery.id} cattery={cattery} directory={directory} catLookup={catLookup} actions={actions} />
      </div>
    </SettingsSection>
  );
}

/**
 * `/entities/catteries`, `/entities/catteries/new` and
 * `/entities/catteries/:catteryId/settings`: the Cattery (貓窩) canvas, with
 * its direct members and its org chart (SPEC-103). The URL is the only source
 * of the selected Cattery.
 */
export function CatteriesCanvasPage({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const { state, pending, reload, run } = useDirectory();
  const { toasts, showToast } = useToast();
  const { dialog, confirm, handleClose } = useConfirmDialog();
  const cats = envelope.lobby.cats;
  const catLookup = useCatLookup(cats);
  const creating = location.pathname === CATTERIES_DIRECTORY_NEW_PATH;
  const actions: DirectoryCanvasActions = useMemo(() => ({
    run,
    pending,
    toast: (message: string) => showToast(message),
    fail: (error: DirectoryRequestError) => showToast(directoryErrorMessage(t, error), { level: 'error' }),
  }), [run, pending, showToast, t]);

  if (state.status === 'loading') return <div className="catsCanvasPageBoot" />;

  const header = (
    <header className="entityCanvasHeader">
      <div>
        <p className="eyebrow">{t(messageKeys.catteriesListEyebrow)}</p>
        <h1 className="entityCanvasTitle">{t(messageKeys.catteriesListTitle)}</h1>
      </div>
    </header>
  );

  if (state.status === 'error') {
    return (
      <div className="entityCanvas entityCanvas--catteries" aria-label={t(messageKeys.catteriesCanvasAriaLabel)}>
        {header}
        <DirectoryLoadError error={state.error} onRetry={() => { void reload(); }} />
      </div>
    );
  }

  const { directory } = state;
  const selected = params.catteryId
    ? directory.catteries.find((cattery) => cattery.id === params.catteryId) ?? null
    : null;
  if (!creating && !selected && directory.catteries.length > 0) {
    return <Navigate replace to={buildCatterySettingsPath(directory.catteries[0].id)} />;
  }
  const showCreate = creating || !selected;

  async function handleDelete(cattery: PlatformCatteryView) {
    const clowderCount = directory.clowders.filter((clowder) => clowder.parentCatteryId === cattery.id).length;
    const catIds = new Set([
      ...cattery.members.map((member) => member.catId),
      ...directory.clowders
        .filter((clowder) => clowder.parentCatteryId === cattery.id)
        .flatMap((clowder) => clowder.members.map((member) => member.catId)),
    ].filter((catId) => catLookup.has(catId)));
    const accepted = await confirm({
      title: t(messageKeys.catteriesCanvasDeleteTitle, { name: cattery.name }),
      message: clowderCount > 0
        ? t(messageKeys.catteriesCanvasDeleteMessage, { cats: String(catIds.size), clowders: String(clowderCount), name: cattery.name })
        : t(messageKeys.catteriesCanvasDeleteMessageNoClowders, { cats: String(catIds.size), name: cattery.name }),
      confirmLabel: t(messageKeys.catteriesCanvasDeleteConfirm),
    });
    if (!accepted) return;
    try {
      const next = await run(() => directoryApi.deleteCattery(cattery.id));
      showToast(t(messageKeys.directoryToastDeleted, { group: cattery.name }));
      navigate(next.catteries[0] ? buildCatterySettingsPath(next.catteries[0].id) : CATTERIES_DIRECTORY_PATH, { replace: true });
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  return (
    <div className="entityCanvas entityCanvas--catteries" aria-label={t(messageKeys.catteriesCanvasAriaLabel)}>
      {header}
      <div className="directoryLayout">
        <CatteryStrip directory={directory} selectedId={showCreate ? null : selected!.id} creating={showCreate} />
        {showCreate ? (
          <CatteryCreateCard directory={directory} cats={cats} actions={actions} canCancel={directory.catteries.length > 0} />
        ) : (
          <CatteryDetailCard
            cattery={selected!}
            directory={directory}
            cats={cats}
            catLookup={catLookup}
            actions={actions}
            onDelete={() => { void handleDelete(selected!); }}
          />
        )}
      </div>
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
      <ToastContainer toasts={toasts} />
    </div>
  );
}
