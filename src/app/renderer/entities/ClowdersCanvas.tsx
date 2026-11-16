import { useMemo, useRef, useState, type FormEvent } from 'react';
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
  CLOWDERS_DIRECTORY_NEW_PATH,
  CLOWDERS_DIRECTORY_PATH,
  buildCatterySettingsPath,
  buildClowderHomePath,
  buildClowderSettingsPath,
} from '../../../shared/directoryPaths.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import type {
  MembershipStatus,
  PlatformClowderMemberView,
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
  EndDateField,
  groupClowders,
  useCatLookup,
  useDismiss,
  type DirectoryCanvasActions,
} from './directoryParts.js';
import { MoveMemberDialog } from './MoveMemberDialog.js';
import './directory.css';

type StatusFilter = 'all' | MembershipStatus;
type CanvasActions = DirectoryCanvasActions;

function ClowderStrip({
  directory,
  selectedId,
  creating,
}: {
  directory: PlatformDirectoryView;
  selectedId: string | null;
  creating: boolean;
}) {
  const { t } = useI18n();
  const groups = groupClowders(directory, t(messageKeys.clowderHomeChipCrossUnit));
  return (
    <nav className="directoryStrip" aria-label={t(messageKeys.clowdersCanvasStripAria)}>
      {groups.map((group, index) => (
        <div key={group.key} className="directoryStripGroup">
          {index > 0 ? <span className="catsSelectorDivider" aria-hidden="true" /> : null}
          <div className="directoryStripGroupBody">
            <span className="directoryStripCaption">{group.label}</span>
            <div className="directoryStripItems">
              {group.clowders.map((clowder) => (
                <Link
                  key={clowder.id}
                  to={buildClowderSettingsPath(clowder.id)}
                  className={clowder.id === selectedId ? 'directoryStripItem directoryStripItemActive' : 'directoryStripItem'}
                  aria-current={clowder.id === selectedId ? 'page' : undefined}
                  aria-label={clowder.name}
                  data-tooltip={clowder.name}
                >
                  <DirectoryGroupAvatar name={clowder.name} kind="clowder" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      ))}
      <Link
        to={CLOWDERS_DIRECTORY_NEW_PATH}
        className={creating ? 'directoryStripNew directoryStripItemActive' : 'directoryStripNew'}
        aria-label={t(messageKeys.entitiesSidebarNewClowder)}
        aria-current={creating ? 'page' : undefined}
        data-tooltip={t(messageKeys.entitiesSidebarNewClowder)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>
    </nav>
  );
}

function ClowderCreateCard({
  directory,
  cats,
  actions,
  canCancel,
}: {
  directory: PlatformDirectoryView;
  cats: readonly PlatformLobbyCatSummary[];
  actions: CanvasActions;
  canCancel: boolean;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const presetParent = new URLSearchParams(location.search).get('cattery');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentCatteryId, setParentCatteryId] = useState<string | null>(
    presetParent && directory.catteries.some((cattery) => cattery.id === presetParent) ? presetParent : null,
  );
  const [memberIds, setMemberIds] = useState<string[]>([]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!name.trim() || actions.pending) return;
    const before = new Set(directory.clowders.map((clowder) => clowder.id));
    try {
      const next = await actions.run(() => directoryApi.createClowder({
        name: name.trim(),
        description: description.trim() || null,
        parentCatteryId,
        members: memberIds.map((catId) => ({ catId })),
      }));
      const created = next.clowders.find((clowder) => !before.has(clowder.id));
      navigate(created ? buildClowderSettingsPath(created.id) : CLOWDERS_DIRECTORY_PATH, { replace: true });
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  const parentOptions: Array<{ id: string | null; name: string; hint: string }> = [
    { id: null, name: t(messageKeys.clowdersCanvasParentNone), hint: t(messageKeys.clowdersCanvasParentNoneHint) },
    ...directory.catteries.map((cattery) => ({
      id: cattery.id,
      name: cattery.name,
      hint: t(messageKeys.clowdersCanvasParentCatteryHint),
    })),
  ];

  return (
    <SettingsSection
      className="catsDetailCard"
      header={
        <SettingsSectionHeader
          title={t(messageKeys.entitiesSidebarNewClowder)}
          status={
            <SettingsActionBar>
              {canCancel ? (
                <button type="button" className="secondaryButton" onClick={() => navigate(CLOWDERS_DIRECTORY_PATH)} disabled={actions.pending}>
                  {t(messageKeys.sharedCatsCreateCancel)}
                </button>
              ) : null}
              <button
                type="button"
                className="primaryButton"
                disabled={!name.trim() || actions.pending}
                onClick={() => { void submit(); }}
              >
                {t(messageKeys.clowdersCanvasSaveAction)}
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
              <input
                className="textInput"
                value={name}
                maxLength={80}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              <span>{t(messageKeys.directoryDescriptionLabel)}</span>
              <textarea
                className="textInput directoryTextarea"
                value={description}
                maxLength={500}
                rows={3}
                placeholder={t(messageKeys.clowdersCanvasDescriptionPlaceholder)}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </SettingsSubSection>
        </div>
        <div className="catsDetailColumn">
          <SettingsSubSection headerless className="catsSubCard">
            <fieldset className="directoryFieldset">
              <legend className="directorySubHeading">{t(messageKeys.clowdersCanvasParentHeading)}</legend>
              {parentOptions.map((option) => (
                <label
                  key={option.id ?? 'none'}
                  className={option.id === parentCatteryId ? 'directoryOption directoryOptionChecked' : 'directoryOption'}
                >
                  <input
                    type="radio"
                    name="clowderParent"
                    checked={option.id === parentCatteryId}
                    onChange={() => setParentCatteryId(option.id)}
                  />
                  {option.id ? <DirectoryGroupAvatar name={option.name} kind="cattery" size="small" /> : null}
                  <span className="directoryOptionText">
                    <span className="directoryOptionName">{option.name}</span>
                    <span className="directoryHint">{option.hint}</span>
                  </span>
                </label>
              ))}
              <p className="directoryHint directoryHintFixed">{t(messageKeys.clowdersCanvasParentFixedHint)}</p>
            </fieldset>
          </SettingsSubSection>
          <SettingsSubSection headerless className="catsSubCard">
            <div className="directorySubHeader">
              <h3 className="directorySubHeading">{t(messageKeys.clowdersCanvasInitialMembersHeading)}</h3>
              <span className="directoryHint">{t(messageKeys.clowdersCanvasInitialMembersHint)}</span>
            </div>
            {cats.length === 0 ? (
              <p className="directoryHint">{t(messageKeys.directoryNoCats)}</p>
            ) : (
              <div className="directoryCatPicker">
                {cats.map((cat) => {
                  const selected = memberIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className="directoryCatPick"
                      aria-pressed={selected}
                      onClick={() => setMemberIds((current) => selected
                        ? current.filter((id) => id !== cat.id)
                        : [...current, cat.id])}
                    >
                      <DirectoryCatAvatar cat={cat} size="small" />
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </SettingsSubSection>
        </div>
      </form>
    </SettingsSection>
  );
}

/** Name and description save when the field loses focus, like the cats canvas fields. */
function ClowderIdentityCard({
  clowder,
  directory,
  actions,
}: {
  clowder: PlatformClowderView;
  directory: PlatformDirectoryView;
  actions: CanvasActions;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(clowder.name);
  const [description, setDescription] = useState(clowder.description ?? '');
  const parent = directory.catteries.find((cattery) => cattery.id === clowder.parentCatteryId) ?? null;

  async function save(patch: { name?: string; description?: string | null }) {
    try {
      await actions.run(() => directoryApi.updateClowder(clowder.id, patch));
    } catch (error) {
      setName(clowder.name);
      setDescription(clowder.description ?? '');
      actions.fail(error as DirectoryRequestError);
    }
  }

  return (
    <SettingsSubSection headerless className="catsSubCard">
      <div className="directoryIdentityRow">
        <DirectoryGroupAvatar name={name || clowder.name} kind="clowder" />
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
            if (!next) setName(clowder.name);
            else if (next !== clowder.name) void save({ name: next });
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
          placeholder={t(messageKeys.clowdersCanvasDescriptionPlaceholder)}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => {
            const next = description.trim() || null;
            if (next !== clowder.description) void save({ description: next });
          }}
        />
      </label>
      <div className="fieldLabel">
        <span>{t(messageKeys.clowdersCanvasParentHeading)}</span>
        <div className="directoryFixedField">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          <span>{parent ? parent.name : t(messageKeys.clowdersCanvasParentNone)}</span>
        </div>
        <p className="directoryHint">{t(messageKeys.clowdersCanvasParentFixedHint)}</p>
      </div>
    </SettingsSubSection>
  );
}

function ClowderMemberRow({
  clowder,
  member,
  cat,
  actions,
  onMove,
}: {
  clowder: PlatformClowderView;
  member: PlatformClowderMemberView;
  cat: PlatformLobbyCatSummary;
  actions: CanvasActions;
  onMove: (mode: 'move' | 'add') => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  async function update(patch: Parameters<typeof directoryApi.updateClowderMember>[2]) {
    try {
      await actions.run(() => directoryApi.updateClowderMember(clowder.id, member.catId, patch));
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  async function remove() {
    setOpen(false);
    try {
      await actions.run(() => directoryApi.removeClowderMember(clowder.id, member.catId));
      actions.toast(t(messageKeys.directoryToastRemoved, { cat: cat.name, group: clowder.name }));
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  return (
    <li className="directoryMemberRow" ref={ref}>
      <DirectoryCatAvatar cat={cat} />
      <span className="directoryMemberText">
        <span className="directoryMemberName">{cat.name}</span>
        <span className="directoryMemberRole">
          {member.role === 'lead' ? t(messageKeys.directoryRoleLead) : t(messageKeys.directoryRoleMember)}
        </span>
      </span>
      {member.status !== 'formal' ? <MembershipStatusChip status={member.status} expiresAt={member.expiresAt} /> : null}
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
          <button
            type="button"
            role="menuitem"
            className="accountMenuItem directoryMenuItem"
            disabled={actions.pending}
            onClick={() => { void update({ role: member.role === 'lead' ? 'member' : 'lead' }); }}
          >
            {member.role === 'lead' ? t(messageKeys.directoryMemberRemoveLead) : t(messageKeys.directoryMemberMakeLead)}
          </button>
          <p className="directoryMenuCaption">{t(messageKeys.clowdersCanvasMemberStatusHeading)}</p>
          <DirectorySegmented<MembershipStatus>
            label={t(messageKeys.clowdersCanvasMemberStatusHeading)}
            value={member.status}
            disabled={actions.pending}
            options={[
              { value: 'formal', label: t(messageKeys.directoryStatusFormal) },
              { value: 'temp', label: t(messageKeys.directoryStatusTemp) },
              { value: 'external', label: t(messageKeys.directoryStatusExternal) },
            ]}
            onChange={(status) => { void update({ status }); }}
          />
          {member.status === 'temp' ? (
            <EndDateField value={member.expiresAt} onCommit={(expiresAt) => { void update({ expiresAt }); }} />
          ) : null}
          <div className="accountMenuDivider" role="separator" />
          <button type="button" role="menuitem" className="accountMenuItem directoryMenuItem" onClick={() => { setOpen(false); onMove('move'); }}>
            {t(messageKeys.clowdersCanvasMemberMoveTo)}
          </button>
          <button type="button" role="menuitem" className="accountMenuItem directoryMenuItem" onClick={() => { setOpen(false); onMove('add'); }}>
            {t(messageKeys.clowdersCanvasMemberAlsoAdd)}
          </button>
          <div className="accountMenuDivider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="accountMenuItem directoryMenuItem directoryMenuItemDanger"
            disabled={actions.pending}
            onClick={() => { void remove(); }}
          >
            {t(messageKeys.clowdersCanvasMemberRemove)}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function ClowderMembersCard({
  clowder,
  cats,
  catLookup,
  actions,
  onMove,
}: {
  clowder: PlatformClowderView;
  cats: readonly PlatformLobbyCatSummary[];
  catLookup: Map<string, PlatformLobbyCatSummary>;
  actions: CanvasActions;
  onMove: (catId: string, mode: 'move' | 'add') => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<StatusFilter>('all');

  async function addCat(cat: PlatformLobbyCatSummary) {
    try {
      await actions.run(() => directoryApi.addClowderMember(clowder.id, { catId: cat.id }));
      actions.toast(t(messageKeys.directoryToastAdded, { cat: cat.name, group: clowder.name }));
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }
  const members = clowder.members.filter((member) => catLookup.has(member.catId));
  const count = (status: StatusFilter) => members.filter((member) => status === 'all' || member.status === status).length;
  const shown = members.filter((member) => filter === 'all' || member.status === filter);
  const filters: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: t(messageKeys.directoryFilterAll) },
    { value: 'formal', label: t(messageKeys.directoryStatusFormal) },
    { value: 'temp', label: t(messageKeys.directoryStatusTemp) },
    { value: 'external', label: t(messageKeys.directoryStatusExternal) },
  ];

  return (
    <SettingsSubSection headerless className="catsSubCard directoryMembersCard">
      <div className="directorySubHeader">
        <h3 className="directorySubHeading">
          {t(messageKeys.directoryMembersHeading)} <span className="directoryCount">{members.length}</span>
        </h3>
        <AddCatPopover
          memberIds={new Set(clowder.members.map((member) => member.catId))}
          cats={cats}
          pending={actions.pending}
          onAdd={(cat) => { void addCat(cat); }}
        />
      </div>
      {members.length > 0 ? (
        <div className="directoryFilters" role="group" aria-label={t(messageKeys.directoryFilterAria)}>
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              className="directoryFilter"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label} <span className="directoryCount">{count(option.value)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {members.length === 0 ? (
        <p className="directoryHint">{t(messageKeys.clowdersCanvasEmptyMembers)}</p>
      ) : shown.length === 0 ? (
        <p className="directoryHint">{t(messageKeys.directoryEmptyFilter)}</p>
      ) : (
        <ul className="directoryMemberList">
          {shown.map((member) => (
            <ClowderMemberRow
              key={member.catId}
              clowder={clowder}
              member={member}
              cat={catLookup.get(member.catId)!}
              actions={actions}
              onMove={(mode) => onMove(member.catId, mode)}
            />
          ))}
        </ul>
      )}
    </SettingsSubSection>
  );
}

function ClowderDetailCard({
  clowder,
  directory,
  cats,
  catLookup,
  actions,
  onDelete,
}: {
  clowder: PlatformClowderView;
  directory: PlatformDirectoryView;
  cats: readonly PlatformLobbyCatSummary[];
  catLookup: Map<string, PlatformLobbyCatSummary>;
  actions: CanvasActions;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [moving, setMoving] = useState<{ catId: string; mode: 'move' | 'add' } | null>(null);
  const parent = directory.catteries.find((cattery) => cattery.id === clowder.parentCatteryId) ?? null;
  const movingCat = moving ? catLookup.get(moving.catId) ?? null : null;

  return (
    <SettingsSection
      className="catsDetailCard"
      header={
        <SettingsSectionHeader
          title={
            <>
              {clowder.name}
              {parent ? (
                <Link className="directoryChip directoryChip--parent" to={buildCatterySettingsPath(parent.id)}>
                  {t(messageKeys.clowderHomeChipPartOf, { catteryName: parent.name })}
                </Link>
              ) : (
                <span className="directoryChip directoryChip--crossUnit">{t(messageKeys.clowderHomeChipCrossUnit)}</span>
              )}
            </>
          }
          status={
            <SettingsActionBar>
              <Link className="secondaryButton" to={buildClowderHomePath(clowder.id)}>
                {t(messageKeys.entityCanvasOpenClowderAction)}
              </Link>
              <button type="button" className="secondaryButton" disabled={actions.pending} onClick={onDelete}>
                {t(messageKeys.sharedSettingsCatsDeleteLabel)}
              </button>
            </SettingsActionBar>
          }
        />
      }
    >
      <div className="catsDetailBody directoryDetailBody">
        <div className="catsDetailColumn">
          <ClowderIdentityCard key={clowder.id} clowder={clowder} directory={directory} actions={actions} />
        </div>
        <div className="catsDetailColumn">
          <ClowderMembersCard
            key={clowder.id}
            clowder={clowder}
            cats={cats}
            catLookup={catLookup}
            actions={actions}
            onMove={(catId, mode) => setMoving({ catId, mode })}
          />
        </div>
      </div>
      {moving && movingCat ? (
        <MoveMemberDialog
          directory={directory}
          source={clowder}
          cat={movingCat}
          initialMode={moving.mode}
          actions={actions}
          onClose={() => setMoving(null)}
        />
      ) : null}
    </SettingsSection>
  );
}

/**
 * `/entities/clowders`, `/entities/clowders/new` and
 * `/entities/clowders/:clowderId/settings`: the Clowder (貓群) canvas. Like the
 * cats canvas, the URL is the only source of the selected Clowder, and
 * `/entities/clowders` opens the first one, or the create form when there is
 * none (SPEC-103).
 */
export function ClowdersCanvasPage({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const { state, pending, reload, run } = useDirectory();
  const { toasts, showToast: show } = useToast();
  const { dialog, confirm, handleClose } = useConfirmDialog();
  const cats = envelope.lobby.cats;
  const catLookup = useCatLookup(cats);
  const creating = location.pathname === CLOWDERS_DIRECTORY_NEW_PATH;
  const actions: CanvasActions = useMemo(() => ({
    run,
    pending,
    toast: (message: string) => show(message),
    fail: (error: DirectoryRequestError) => show(directoryErrorMessage(t, error), { level: 'error' }),
  }), [run, pending, show, t]);

  if (state.status === 'loading') return <div className="catsCanvasPageBoot" />;

  const header = (
    <header className="entityCanvasHeader">
      <div>
        <p className="eyebrow">{t(messageKeys.clowdersListEyebrow)}</p>
        <h1 className="entityCanvasTitle">{t(messageKeys.clowdersListTitle)}</h1>
      </div>
    </header>
  );

  if (state.status === 'error') {
    return (
      <div className="entityCanvas entityCanvas--clowders" aria-label={t(messageKeys.clowdersCanvasAriaLabel)}>
        {header}
        <DirectoryLoadError error={state.error} onRetry={() => { void reload(); }} />
      </div>
    );
  }

  const { directory } = state;
  const selected = params.clowderId
    ? directory.clowders.find((clowder) => clowder.id === params.clowderId) ?? null
    : null;
  if (!creating && !selected && directory.clowders.length > 0) {
    return <Navigate replace to={buildClowderSettingsPath(directory.clowders[0].id)} />;
  }
  const showCreate = creating || !selected;

  async function handleDelete(clowder: PlatformClowderView) {
    const count = clowder.members.filter((member) => catLookup.has(member.catId)).length;
    const accepted = await confirm({
      title: t(messageKeys.clowdersCanvasDeleteTitle, { name: clowder.name }),
      message: count > 0
        ? t(messageKeys.clowdersCanvasDeleteMessage, { count: String(count) })
        : t(messageKeys.clowdersCanvasDeleteMessageEmpty),
      confirmLabel: t(messageKeys.clowdersCanvasDeleteConfirm),
    });
    if (!accepted) return;
    try {
      const next = await run(() => directoryApi.deleteClowder(clowder.id));
      show(t(messageKeys.directoryToastDeleted, { group: clowder.name }));
      navigate(next.clowders[0] ? buildClowderSettingsPath(next.clowders[0].id) : CLOWDERS_DIRECTORY_PATH, { replace: true });
    } catch (error) {
      actions.fail(error as DirectoryRequestError);
    }
  }

  return (
    <div className="entityCanvas entityCanvas--clowders" aria-label={t(messageKeys.clowdersCanvasAriaLabel)}>
      {header}
      <div className="directoryLayout">
        <ClowderStrip directory={directory} selectedId={showCreate ? null : selected!.id} creating={showCreate} />
        {showCreate ? (
          <ClowderCreateCard
            key={location.search}
            directory={directory}
            cats={cats}
            actions={actions}
            canCancel={directory.clowders.length > 0}
          />
        ) : (
          <ClowderDetailCard
            clowder={selected!}
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
