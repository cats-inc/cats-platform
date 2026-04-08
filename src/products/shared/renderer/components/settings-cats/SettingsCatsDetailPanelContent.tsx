import type { Dispatch, SetStateAction } from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import type {
  DurableMemoryItem,
  TelegramTransportBindingDiagnostics,
} from '../../api/index.js';
import type { SettingsCatsMemoryController } from '../../hooks/useSettingsCatsMemory.js';
import type { BotFormState } from '../../hooks/settingsCatsRegistryActions.js';
import { buildProductSurfaceToggleStates } from '../../../../../design/components/productSurfaceToggles.js';
import { defaultCatProducts, hasPlatformSurface } from '../../../../../shared/platformSurfaces.js';
import { MEMORY_CATEGORIES, SKILL_PROFILES, formatTransportTimestamp } from './viewSupport.js';

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
  onUpdateProducts: (catId: string, products: string[]) => Promise<void>;
}

export interface SettingsCatsDetailPanelContentProps {
  busy: string;
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  cat: AppShellPayload['chat']['cats'][number];
  isBossCat: boolean;
  memoryController: SettingsCatsMemoryController;
  registryController: SettingsCatsDetailPanelRegistryController;
  telegramDiagnostics: {
    bindings: TelegramTransportBindingDiagnostics[];
  } | null;
  availableSurfaces?: string[];
  enabledSurfaces?: string[];
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export function SettingsCatsDetailPanelContent({
  busy,
  botBindings,
  cat,
  isBossCat,
  memoryController,
  registryController,
  telegramDiagnostics,
  availableSurfaces,
  enabledSurfaces,
  confirm: confirmDialog,
}: SettingsCatsDetailPanelContentProps) {
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
    onUpdateProducts,
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
  const surfaceToggleStates = buildProductSurfaceToggleStates({
    surfaces: availableSurfaces ?? [],
    selected: cat.products,
    enabledSurfaces,
    requiredSurfaces: isBossCat ? ['chat'] : [],
    disabled: busy === `cat:products:${cat.id}`,
  });
  const canBindTelegramBot = cat.status === 'active'
    && hasPlatformSurface(cat.products, 'chat', { fallback: defaultCatProducts() });

  return (
    <>
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
              || busy === `cat:rename:${cat.id}`
            }
            onClick={() => void onRenameCat(cat.id)}
          >
            {busy === `cat:rename:${cat.id}` ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {availableSurfaces && availableSurfaces.length > 1 ? (
        <div className="catDetailSection">
          <p className="sectionLabel">Available in</p>
          <div className="productToggles">
            {surfaceToggleStates.map(({ surface, active, disabled, unavailable }) => {
              return (
                <button
                  key={surface}
                  type="button"
                  className={active ? 'productToggle productToggleActive' : 'productToggle'}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) {
                      return;
                    }
                    const next = active
                      ? cat.products.filter((candidate) => candidate !== surface)
                      : [...cat.products, surface];
                    void onUpdateProducts(cat.id, next);
                  }}
                  data-tooltip={unavailable ? `${surface} is not enabled yet` : undefined}
                >
                  {surface}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!isBossCat ? (
        <div className="catDetailSection">
          <p className="sectionLabel">Boss Cat</p>
          <button
            className="primaryButton"
            type="button"
            disabled={busy === `cat:makeBoss:${cat.id}`}
            onClick={async () => {
              const confirmed = confirmDialog
                ? await confirmDialog({ title: 'Change Boss Cat', message: `Make ${cat.name} the Boss Cat? This will change the default lead for new chats.`, confirmLabel: 'Confirm' })
                : true;
              if (confirmed) {
                void onMakeBossCat(cat.id);
              }
            }}
          >
            {busy === `cat:makeBoss:${cat.id}` ? 'Setting...' : `Make ${cat.name} the Boss Cat`}
          </button>
        </div>
      ) : null}

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
              disabled={busy === `cat:skill:${cat.id}`}
              onClick={() => void onSkillChange(cat.id, profile.value)}
            >
              {profile.label}
            </button>
          ))}
        </div>
      </div>

      <div className="catDetailSection">
        <p className="sectionLabel">Telegram Bot</p>
        {catBindings.length > 0 ? (
          <div className="botBindingList">
            {catBindings.map((binding) => (
              <div key={binding.id} className="botBindingItem">
                <div>
                  <strong>@{binding.botName}</strong>
                  <span className="statusChip statusChipReady" style={{ marginLeft: 8 }}>
                    {binding.status}
                  </span>
                  <span
                    className={`statusChip ${binding.inboundMode === 'polling' ? 'statusChipMuted' : 'statusChipPending'}`}
                    style={{ marginLeft: 4 }}
                  >
                    {binding.inboundMode}
                  </span>
                  <div style={{ marginTop: 6, opacity: 0.7 }}>
                    {binding.inboundMode === 'webhook' ? (
                      <div>Webhook: {binding.webhookPath}</div>
                    ) : null}
                    <div>Room mode: {binding.roomMode}</div>
                    <div>
                      Token {binding.hasBotToken ? 'configured' : 'missing'}
                      {binding.inboundMode === 'webhook' ? (
                        <>{' · '}Secret {binding.hasWebhookSecret ? 'configured' : 'missing'}</>
                      ) : null}
                    </div>
                    {catBindingDiagnostics
                      .filter((diagnostic) => diagnostic.bindingId === binding.id)
                      .slice(0, 1)
                      .map((diagnostic) => (
                        <div key={diagnostic.conversationId}>
                          Inbox {diagnostic.telegramChatId}
                          {' · '}
                          Room {diagnostic.linkedRoomId ?? 'pending'}
                          {' · '}
                          Last inbound {formatTransportTimestamp(diagnostic.lastInboundAt)}
                        </div>
                      ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="chromeButton"
                    type="button"
                    disabled={busy === `bot:delete:${binding.id}`}
                    onClick={() => void onDeleteBinding(binding.id)}
                  >
                    &#x2715;
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ opacity: 0.6, marginBottom: 8 }}>No Telegram bot bound yet.</p>
        )}
        {catBindings.length > 0 && catBindingDiagnostics.length === 0 ? (
          <p style={{ opacity: 0.6, marginBottom: 8 }}>
            No webhook traffic has been recorded for this cat yet.
          </p>
        ) : null}
        {catBindings.length === 0 ? (
          <div className="botBindingForm">
            <input
              className="textInput"
              placeholder="Bot username (e.g. my_cat_bot)"
              value={botForm.botName}
              onChange={(event) => setBotForm({ ...botForm, botName: event.target.value })}
            />
            <input
              className="textInput"
              placeholder="Bot token"
              type="password"
              value={botForm.botToken}
              onChange={(event) => setBotForm({ ...botForm, botToken: event.target.value })}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ opacity: 0.8, fontSize: 12 }}>Mode:</label>
              <button
                type="button"
                className={`chromeButton${botForm.inboundMode === 'polling' ? ' chromeButtonActive' : ''}`}
                onClick={() => setBotForm({ ...botForm, inboundMode: 'polling' })}
                style={{ fontSize: 11 }}
              >
                Polling
              </button>
              <button
                type="button"
                className={`chromeButton${botForm.inboundMode === 'webhook' ? ' chromeButtonActive' : ''}`}
                onClick={() => setBotForm({ ...botForm, inboundMode: 'webhook' })}
                style={{ fontSize: 11 }}
              >
                Webhook
              </button>
            </div>
            {botForm.inboundMode === 'webhook' ? (
              <input
                className="textInput"
                placeholder="Webhook secret (optional)"
                value={botForm.webhookSecret}
                onChange={(event) => setBotForm({ ...botForm, webhookSecret: event.target.value })}
              />
            ) : null}
            <button
              className="primaryButton"
              type="button"
              disabled={!botForm.botName.trim() || busy === 'bot:create' || !canBindTelegramBot}
              onClick={() => void onCreateBinding(cat.id)}
            >
              {busy === 'bot:create'
                ? 'Creating...'
                : canBindTelegramBot
                  ? 'Add Telegram Bot'
                  : 'Unavailable for archived/non-chat cats'}
            </button>
          </div>
        ) : (
          <p style={{ opacity: 0.6, marginBottom: 8 }}>
            This Cat already has a Telegram bot. Remove it first if you want to bind another one.
          </p>
        )}
      </div>

      <div className="catDetailSection">
        <p className="sectionLabel">Memory ({memoryLoading ? '...' : catMemory.length})</p>
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
        ) : !memoryLoading ? (
          <p style={{ opacity: 0.6, marginBottom: 8 }}>No memory records yet.</p>
        ) : null}
        <div className="memoryForm">
          <select
            className="textInput"
            value={memoryForm.category}
            onChange={(event) =>
              setMemoryForm({ ...memoryForm, category: event.target.value })}
          >
            {MEMORY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <textarea
            className="textInput"
            rows={2}
            placeholder="Memory content..."
            value={memoryForm.content}
            onChange={(event) =>
              setMemoryForm({ ...memoryForm, content: event.target.value })}
          />
          <button
            className="primaryButton"
            type="button"
            disabled={!memoryForm.content.trim() || busy === 'memory:create'}
            onClick={() => void addMemory(cat.id)}
          >
            {busy === 'memory:create' ? 'Saving...' : 'Add Memory'}
          </button>
        </div>
      </div>
    </>
  );
}

function SettingsCatsMemoryRow({
  busy,
  memoryRecord,
  onDelete,
}: {
  busy: string;
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
        className="chromeButton"
        type="button"
        disabled={busy === `memory:delete:${memoryRecord.id}`}
        onClick={onDelete}
      >
        &#x2715;
      </button>
    </div>
  );
}
