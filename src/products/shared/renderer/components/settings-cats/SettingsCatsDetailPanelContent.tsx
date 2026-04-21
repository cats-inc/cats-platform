import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import type {
  DurableMemoryItem,
  TelegramTransportBindingDiagnostics,
} from '../../api/index.js';
import type { SettingsCatsMemoryController } from '../../hooks/useSettingsCatsMemory.js';
import type { BotFormState } from '../../hooks/settingsCatsRegistryActions.js';
import { defaultCatProducts, hasPlatformSurface } from '../../../../../shared/platformSurfaces.js';
import {
  isBotBusy,
  isCatBusy,
  isMemoryBusy,
  type WorkspaceBusyState,
} from '../../../../../shared/workspaceBusy.js';
import { MemoryEditorDialog } from './MemoryEditorDialog.js';
import { TelegramConnectDialog } from './TelegramConnectDialog.js';
import { SKILL_PROFILES, formatTransportTimestamp } from './viewSupport.js';

export interface SettingsCatsDetailPanelRegistryController {
  botForm: BotFormState;
  renameValue: string;
  setBotForm: Dispatch<SetStateAction<BotFormState>>;
  setRenameValue: Dispatch<SetStateAction<string>>;
  onCreateBinding: (catId: string) => Promise<void>;
  onDeleteBinding: (bindingId: string) => Promise<void>;
  onMakeBossCat: (catId: string) => Promise<void>;
  onRenameCat: (catId: string) => Promise<void>;
  onSkillChange: (catId: string, skillProfile: string) => Promise<void>;
}

export type SettingsCatsDetailSectionKey =
  | 'rename'
  | 'makeBoss'
  | 'skill'
  | 'telegram'
  | 'memory';

export interface SettingsCatsDetailPanelContentProps {
  busy: WorkspaceBusyState;
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  cat: AppShellPayload['chat']['cats'][number];
  isBossCat: boolean;
  memoryController: SettingsCatsMemoryController;
  registryController: SettingsCatsDetailPanelRegistryController;
  telegramDiagnostics: {
    bindings: TelegramTransportBindingDiagnostics[];
  } | null;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  sections?: ReadonlyArray<SettingsCatsDetailSectionKey>;
}

export function SettingsCatsDetailPanelContent({
  busy,
  botBindings,
  cat,
  isBossCat,
  memoryController,
  registryController,
  telegramDiagnostics,
  confirm: confirmDialog,
  sections,
}: SettingsCatsDetailPanelContentProps) {
  const shouldRender = (key: SettingsCatsDetailSectionKey) =>
    sections === undefined || sections.includes(key);
  const {
    botForm,
    renameValue,
    setBotForm,
    setRenameValue,
    onCreateBinding,
    onDeleteBinding,
    onMakeBossCat,
    onRenameCat,
    onSkillChange,
  } = registryController;
  const {
    memoryForm,
    setMemoryForm,
    catMemory,
    memoryLoading,
    addMemory,
    deleteMemory,
  } = memoryController;
  const catBindings = botBindings.filter((binding) => binding.catId === cat.id);
  const catBindingDiagnostics = telegramDiagnostics?.bindings.filter((binding) =>
    binding.bindingId && catBindings.some((candidate) => candidate.id === binding.bindingId),
  ) ?? [];
  const canBindTelegramBot = cat.status === 'active'
    && hasPlatformSurface(cat.products, 'chat', { fallback: defaultCatProducts() });

  // Dialog is opened from the empty-state button; it closes itself when
  // the create succeeds (catBindings.length transitions from 0 → >0) or
  // when the user cancels / hits Escape / clicks the overlay.
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  useEffect(() => {
    if (catBindings.length > 0) setTelegramDialogOpen(false);
  }, [catBindings.length]);
  useEffect(() => {
    setTelegramDialogOpen(false);
  }, [cat.id]);

  // Memory dialog closes on successful add — the controller's addMemory
  // resolves to void and catches errors internally, so we detect
  // success by watching catMemory.length increase while the dialog is
  // open (unlike Telegram's 0→1 transition, memory grows monotonically).
  const [memoryDialogOpen, setMemoryDialogOpen] = useState(false);
  const prevMemoryLenRef = useRef(catMemory.length);
  useEffect(() => {
    const prev = prevMemoryLenRef.current;
    if (memoryDialogOpen && catMemory.length > prev) {
      setMemoryDialogOpen(false);
    }
    prevMemoryLenRef.current = catMemory.length;
  }, [memoryDialogOpen, catMemory.length]);
  useEffect(() => {
    setMemoryDialogOpen(false);
  }, [cat.id]);

  return (
    <>
      {shouldRender('rename') ? (
        <div className="catDetailSection">
          <p className="sectionLabel">Rename</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="textInput"
              placeholder={cat.name}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onFocus={() => setRenameValue(cat.name)}
            />
            <button
              className="primaryButton"
              type="button"
              disabled={
                !renameValue.trim()
                || renameValue.trim() === cat.name
                || isCatBusy(busy, 'rename', cat.id)
              }
              onClick={() => void onRenameCat(cat.id)}
            >
              {isCatBusy(busy, 'rename', cat.id) ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}

      {shouldRender('makeBoss') && !isBossCat ? (
        <div className="catDetailSection">
          <p className="sectionLabel">Boss Cat</p>
          <button
            className="primaryButton"
            type="button"
            disabled={isCatBusy(busy, 'makeBoss', cat.id)}
            onClick={async () => {
              const confirmed = confirmDialog
                ? await confirmDialog({ title: 'Change Boss Cat', message: `Make ${cat.name} the Boss Cat? This will change the default recipient for new chats.`, confirmLabel: 'Confirm' })
                : true;
              if (confirmed) {
                void onMakeBossCat(cat.id);
              }
            }}
          >
            {isCatBusy(busy, 'makeBoss', cat.id) ? 'Setting...' : `Make ${cat.name} the Boss Cat`}
          </button>
        </div>
      ) : null}

      {shouldRender('skill') ? (
        <div className="catDetailSection">
          <p className="sectionLabel">Skill Profile</p>
          <div className="skillPills">
            {SKILL_PROFILES.map((profile) => (
              <button
                key={profile.value}
                className={
                  (cat.skillProfile ?? 'chat-default') === profile.value
                    ? 'draftLeadPill draftLeadPillActive'
                    : 'draftLeadPill'
                }
                type="button"
                disabled={isCatBusy(busy, 'skill', cat.id)}
                onClick={() => void onSkillChange(cat.id, profile.value)}
              >
                {profile.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {shouldRender('telegram') ? (
        catBindings.length > 0 ? (
          // Connected view. One cat currently supports one bot; the
          // `.map()` is defensive in case the cap ever changes.
          <div className="catsTelegramConnected">
            {catBindings.map((binding) => {
              const diagnostic = catBindingDiagnostics.find(
                (entry) => entry.bindingId === binding.id,
              );
              return (
                <div key={binding.id} className="catsTelegramBinding">
                  <div className="catsTelegramBindingHeader">
                    <strong>@{binding.botName}</strong>
                    <span
                      className={`statusChip ${binding.status === 'active' ? 'statusChipReady' : 'statusChipMuted'}`}
                    >
                      {binding.status === 'active' ? 'Active' : 'Disabled'}
                    </span>
                    <button
                      type="button"
                      className="catsInlineDeleteButton"
                      style={{ marginLeft: 'auto' }}
                      disabled={isBotBusy(busy, 'delete', binding.id)}
                      onClick={() => void onDeleteBinding(binding.id)}
                      aria-label="Disconnect Telegram"
                      data-tooltip="Disconnect"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <p className="catsTelegramHint">
                    {binding.inboundMode === 'polling' ? 'Polling' : 'Webhook'}
                    {diagnostic?.lastInboundAt ? (
                      <> · Last inbound {formatTransportTimestamp(diagnostic.lastInboundAt)}</>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="catsTelegramEmpty">
            <button
              type="button"
              className="primaryButton"
              disabled={!canBindTelegramBot}
              onClick={() => setTelegramDialogOpen(true)}
            >
              Connect Telegram
            </button>
            {!canBindTelegramBot ? (
              <p className="catsTelegramHint">Unavailable for archived or non-chat cats.</p>
            ) : null}
          </div>
        )
      ) : null}

      {telegramDialogOpen ? (
        <TelegramConnectDialog
          botForm={botForm}
          setBotForm={setBotForm}
          busyCreating={isBotBusy(busy, 'create')}
          onSubmit={() => void onCreateBinding(cat.id)}
          onClose={() => setTelegramDialogOpen(false)}
        />
      ) : null}

      {shouldRender('memory') ? (
        <div className="catsMemorySection">
          {catMemory.length > 0 ? (
            <div className="memoryList">
              {catMemory.map((memoryRecord) => (
                <SettingsCatsMemoryRow
                  key={memoryRecord.id}
                  busy={busy}
                  memoryRecord={memoryRecord}
                  onDelete={() => void deleteMemory(cat.id, memoryRecord.id)}
                />
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="primaryButton"
            disabled={isMemoryBusy(busy, 'create')}
            onClick={() => setMemoryDialogOpen(true)}
          >
            Add memory
          </button>
        </div>
      ) : null}

      {memoryDialogOpen ? (
        <MemoryEditorDialog
          memoryForm={memoryForm}
          setMemoryForm={setMemoryForm}
          busyCreating={isMemoryBusy(busy, 'create')}
          onSubmit={() => void addMemory(cat.id)}
          onClose={() => setMemoryDialogOpen(false)}
        />
      ) : null}
    </>
  );
}

function SettingsCatsMemoryRow({
  busy,
  memoryRecord,
  onDelete,
}: {
  busy: WorkspaceBusyState;
  memoryRecord: DurableMemoryItem;
  onDelete: () => void;
}) {
  return (
    <div className="memoryItem">
      <div>
        <span className="statusChip statusChipMuted">{memoryRecord.category}</span>
        <span style={{ marginLeft: 8 }}>
          {memoryRecord.content.slice(0, 100)}
          {memoryRecord.content.length > 100 ? '...' : ''}
        </span>
      </div>
      <button
        className="catsInlineDeleteButton"
        type="button"
        disabled={isMemoryBusy(busy, 'delete', memoryRecord.id)}
        onClick={onDelete}
        aria-label="Delete memory"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
