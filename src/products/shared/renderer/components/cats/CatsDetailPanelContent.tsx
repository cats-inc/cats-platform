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
import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import { CHAT_MCP_PROFILE_ID } from '../../../../../shared/catMcpProfiles.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { MemoryEditorDialog } from './MemoryEditorDialog.js';
import { TelegramConnectDialog } from './TelegramConnectDialog.js';
import {
  getMemoryCategoryLabel,
  MCP_PROFILES,
  SKILL_PROFILES,
  formatTransportTimestamp,
} from './viewSupport.js';

export interface CatsDetailPanelRegistryController {
  botForm: BotFormState;
  renameValue: string;
  setBotForm: Dispatch<SetStateAction<BotFormState>>;
  setRenameValue: Dispatch<SetStateAction<string>>;
  onCreateBinding: (catId: string) => Promise<void>;
  onDeleteBinding: (bindingId: string) => Promise<void>;
  onMakeBossCat: (catId: string) => Promise<void>;
  onMcpProfileChange: (catId: string, mcpProfile: string) => Promise<void>;
  onRenameCat: (catId: string) => Promise<void>;
  onSkillChange: (catId: string, skillProfile: string) => Promise<void>;
}

export type CatsDetailSectionKey =
  | 'rename'
  | 'makeBoss'
  | 'skill'
  | 'mcp'
  | 'telegram'
  | 'memory';

export interface CatsDetailPanelContentProps {
  busy: WorkspaceBusyState;
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  cat: AppShellPayload['chat']['cats'][number];
  isBossCat: boolean;
  memoryController: SettingsCatsMemoryController;
  registryController: CatsDetailPanelRegistryController;
  telegramDiagnostics: {
    bindings: TelegramTransportBindingDiagnostics[];
  } | null;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  sections?: ReadonlyArray<CatsDetailSectionKey>;
}

export function CatsDetailPanelContent({
  busy,
  botBindings,
  cat,
  isBossCat,
  memoryController,
  registryController,
  telegramDiagnostics,
  confirm: confirmDialog,
  sections,
}: CatsDetailPanelContentProps) {
  const shouldRender = (key: CatsDetailSectionKey) =>
    sections === undefined || sections.includes(key);
  const {
    botForm,
    renameValue,
    setBotForm,
    setRenameValue,
    onCreateBinding,
    onDeleteBinding,
    onMakeBossCat,
    onMcpProfileChange,
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
  const { t } = useI18n();

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
          <p className="sectionLabel">{t(messageKeys.sharedSettingsCatsRenameLabel)}</p>
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
              {isCatBusy(busy, 'rename', cat.id)
                ? t(messageKeys.sharedSettingsCatsSaving)
                : t(messageKeys.sharedSettingsCatsSave)}
            </button>
          </div>
        </div>
      ) : null}

      {shouldRender('makeBoss') && !isBossCat ? (
        <div className="catDetailSection">
          <p className="sectionLabel">{t(messageKeys.sharedSettingsCatsBossCatLabel)}</p>
          <button
            className="primaryButton"
            type="button"
            disabled={isCatBusy(busy, 'makeBoss', cat.id)}
            onClick={async () => {
              const confirmed = confirmDialog
                ? await confirmDialog({
                    title: t(messageKeys.sharedSettingsCatsChangeBossCatTitle),
                    message: t(messageKeys.sharedSettingsCatsChangeBossCatMessage, { name: cat.name }),
                    confirmLabel: t(messageKeys.sharedSettingsCatsConfirm),
                  })
                : true;
              if (confirmed) {
                void onMakeBossCat(cat.id);
              }
            }}
          >
            {isCatBusy(busy, 'makeBoss', cat.id)
              ? t(messageKeys.sharedSettingsCatsSetting)
              : t(messageKeys.sharedSettingsCatsMakeBossCatLabel, { name: cat.name })}
          </button>
        </div>
      ) : null}

      {shouldRender('skill') ? (
        <div className="catDetailSection">
          <p className="sectionLabel">{t(messageKeys.sharedSettingsCatsSkillProfileLabel)}</p>
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
                {t(profile.label)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {shouldRender('mcp') ? (
        <div className="catDetailSection">
          <p className="sectionLabel">{t(messageKeys.sharedSettingsCatsMcpProfileLabel)}</p>
          <div className="skillPills">
            {MCP_PROFILES.map((profile) => (
              <button
                key={profile.value}
                className={
                  (cat.mcpProfile ?? CHAT_MCP_PROFILE_ID) === profile.value
                    ? 'draftLeadPill draftLeadPillActive'
                    : 'draftLeadPill'
                }
                type="button"
                disabled={isCatBusy(busy, 'skill', cat.id)}
                onClick={() => void onMcpProfileChange(cat.id, profile.value)}
              >
                {t(profile.label)}
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
                    <span className="catsTelegramBindingIcon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.66 3.88 2.92 10.9a.73.73 0 0 0 .04 1.38l4.45 1.4 1.72 5.52a.78.78 0 0 0 1.24.37l2.48-2.02 4.87 3.6a.78.78 0 0 0 1.2-.46L21.7 4.76c.17-.7-.52-1.27-1.04-0.88ZM10.1 14.6l-.44 3.15-1.34-4.3 9.38-6.2Z" />
                      </svg>
                    </span>
                    <strong
                      className="catsTelegramBindingName"
                      data-tooltip={`@${binding.botName}`}
                    >
                      @{binding.botName}
                    </strong>
                    <button
                      type="button"
                      className="catsInlineDeleteButton catsTelegramBindingDisconnect"
                      disabled={isBotBusy(busy, 'delete', binding.id)}
                      onClick={() => void onDeleteBinding(binding.id)}
                      aria-label={t(messageKeys.sharedSettingsCatsDisconnectTelegramAria)}
                      data-tooltip={t(messageKeys.sharedSettingsCatsDisconnectTelegram)}
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
                  <div className="catsTelegramBindingMeta">
                    <span
                      className={`statusChip ${binding.status === 'active' ? 'statusChipReady' : 'statusChipMuted'}`}
                    >
                      {binding.status === 'active'
                        ? t(messageKeys.sharedSettingsCatsBindingActive)
                        : t(messageKeys.sharedSettingsCatsBindingDisabled)}
                    </span>
                    <span className="statusChip statusChipMuted">
                      {binding.inboundMode === 'polling'
                        ? t(messageKeys.sharedSettingsCatsBindingPollingMode)
                        : t(messageKeys.sharedSettingsCatsBindingWebhookMode)}
                    </span>
                    {diagnostic?.lastInboundAt ? (
                      <span className="catsTelegramBindingLastInbound">
                        {t(messageKeys.sharedSettingsCatsLastInboundLabel, {
                          time: formatTransportTimestamp(diagnostic.lastInboundAt),
                        })}
                      </span>
                    ) : null}
                  </div>
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
              {t(messageKeys.sharedSettingsCatsConnectTelegramLabel)}
            </button>
            {!canBindTelegramBot ? (
              <p className="catsTelegramHint">{t(messageKeys.sharedSettingsCatsUnavailableHint)}</p>
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
                <CatsMemoryRow
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
            {t(messageKeys.sharedSettingsCatsAddMemoryLabel)}
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

function CatsMemoryRow({
  busy,
  memoryRecord,
  onDelete,
}: {
  busy: WorkspaceBusyState;
  memoryRecord: DurableMemoryItem;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const categoryLabel = getMemoryCategoryLabel(memoryRecord.category);

  return (
    <div className="memoryItem">
      <div>
        <span className="statusChip statusChipMuted">
          {categoryLabel ? t(categoryLabel) : memoryRecord.category}
        </span>
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
        aria-label={t(messageKeys.sharedSettingsCatsDeleteMemoryAria)}
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
