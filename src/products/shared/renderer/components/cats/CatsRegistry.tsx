import { useState, type ComponentType, type Dispatch, type SetStateAction } from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import {
  isCatBusy,
  type WorkspaceBusyState,
} from '../../../../../shared/workspaceBusy.js';
import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import type { TelegramTransportDiagnostics } from '../../api/index.js';
import type { SettingsCatsMemoryController } from '../../hooks/useSettingsCatsMemory.js';
import type { BotFormState } from '../../hooks/settingsCatsRegistryActions.js';
import { executionLabel, sortChatCatsForDisplay } from '../../workspaceChatUtils.js';
import type { CatsRegistryController } from './Cats.js';
import { CatsDetailPanel } from './CatsDetailPanel.js';
import {
  getCatProductSurfaceLabel,
  getCatRecordStatusLabel,
} from './viewSupport.js';

export interface SharedCatsRegistryDetailPanelProps {
  busy: WorkspaceBusyState;
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  cat: AppShellPayload['chat']['cats'][number];
  isBossCat: boolean;
  memoryController: SettingsCatsMemoryController;
  registryController: CatsRegistryController<BotFormState>;
  telegramDiagnostics: TelegramTransportDiagnostics | null;
  availableSurfaces?: string[];
  enabledSurfaces?: string[];
  onPayloadUpdate?: (payload: AppShellPayload) => void;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export interface SharedCatsRegistryProps {
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  busy: WorkspaceBusyState;
  expandedCatId: string | null;
  memoryController: SettingsCatsMemoryController;
  payload: AppShellPayload;
  registryController: CatsRegistryController<BotFormState>;
  setExpandedCatId: Dispatch<SetStateAction<string | null>>;
  telegramDiagnostics: TelegramTransportDiagnostics | null;
  availableSurfaces?: string[];
  enabledSurfaces?: string[];
  onPayloadUpdate?: (payload: AppShellPayload) => void;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

interface WorkspaceCatsRegistryProps extends SharedCatsRegistryProps {
  CatsDetailPanelComponent: ComponentType<SharedCatsRegistryDetailPanelProps>;
}

export function WorkspaceCatsRegistry({
  botBindings,
  busy,
  expandedCatId,
  memoryController,
  payload,
  registryController,
  setExpandedCatId,
  telegramDiagnostics,
  availableSurfaces,
  enabledSurfaces,
  onPayloadUpdate,
  confirm: confirmDialog,
  CatsDetailPanelComponent,
}: WorkspaceCatsRegistryProps) {
  const { t } = useI18n();
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = payload.chat.cats.filter((cat) => cat.status === 'archived').length;
  const visibleCats = showArchived
    ? payload.chat.cats
    : payload.chat.cats.filter((cat) => cat.status !== 'archived');
  const sortedCats = sortChatCatsForDisplay(visibleCats, {
    bossCatIds: payload.chat.bossCatId,
    archivedLast: true,
  });

  return (
    <>
      <div className="contentCardHeader">
        <div>
          <p className="sectionLabel">{t(messageKeys.sharedSettingsCatsRegistrySectionLabel)}</p>
          <h2>
            {payload.chat.cats.length > 0
              ? t(messageKeys.sharedSettingsCatsRegistrySavedCatsLabel)
              : t(messageKeys.sharedSettingsCatsRegistryNoCatsYetLabel)}
          </h2>
        </div>
        <span className="countBadge">{visibleCats.length}</span>
      </div>

      {archivedCount > 0 ? (
        <label className="fieldLabel fieldLabelInline" style={{ marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          <span>
            {t(messageKeys.sharedSettingsCatsRegistryShowArchivedLabel, { count: archivedCount })}
          </span>
        </label>
      ) : null}

      <div className="catList">
        {sortedCats.length > 0 ? (
          sortedCats.map((cat) => {
            const isBossCat = cat.id === payload.chat.bossCatId;
            const isExpanded = expandedCatId === cat.id;
            const catBindings = botBindings.filter((binding) => binding.catId === cat.id);
            const catStatusLabelKey = getCatRecordStatusLabel(cat.status);

            return (
              <article key={cat.id} className="catCard">
                <div
                  className="catCardTop"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedCatId(isExpanded ? null : cat.id)}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>{cat.name}</strong>
                      {isBossCat ? (
                        <span className="statusChip statusChipAccent">
                          {t(messageKeys.sharedSettingsCatsRegistryBossCatLabel)}
                        </span>
                      ) : null}
                    </div>
                    <p>{executionLabel(cat)}</p>
                    {cat.products.length > 0 ? (
                      <div className="chipRow" style={{ marginTop: 4 }}>
                        {cat.products.map((surface) => {
                          const productLabelKey = getCatProductSurfaceLabel(surface);
                          return (
                            <span key={surface} className="productBadge">
                              {productLabelKey ? t(productLabelKey) : surface}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div
                    style={{ display: 'flex', alignSelf: 'start', alignItems: 'center', gap: 8 }}
                  >
                    <span
                      className={
                        cat.status === 'active'
                          ? 'statusChip statusChipReady'
                          : 'statusChip statusChipMuted'
                      }
                    >
                      {catStatusLabelKey ? t(catStatusLabelKey) : cat.status}
                    </span>
                    {cat.status === 'archived' ? (
                      <>
                        <button
                          className="chromeButton"
                          type="button"
                          disabled={
                            isCatBusy(busy, 'unarchive', cat.id)
                            || isCatBusy(busy, 'delete', cat.id)
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            void registryController.onUnarchiveCat(cat.id, cat.name);
                          }}
                          data-tooltip={t(
                            messageKeys.sharedSettingsCatsRegistryRecoverTooltip,
                            { name: cat.name },
                          )}
                        >
                          <span className="srOnly">
                            {t(messageKeys.sharedSettingsCatsRegistryRecoverLabel)}
                          </span>
                        </button>
                        <button
                          className="chromeButton"
                          type="button"
                          disabled={isCatBusy(busy, 'delete', cat.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                            void registryController.onDeleteCat(cat.id, cat.name);
                          }}
                          data-tooltip={t(messageKeys.sharedSettingsCatsRegistryDeleteTooltip, { name: cat.name })}
                        >
                          &#x2715;
                        </button>
                      </>
                    ) : (
                      <button
                        className="chromeButton"
                        type="button"
                        disabled={isCatBusy(busy, 'archive', cat.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          void registryController.onArchiveCat(cat.id, cat.name);
                        }}
                        data-tooltip={t(messageKeys.sharedSettingsCatsRegistryArchiveTooltip, { name: cat.name })}
                      >
                        &#x2715;
                      </button>
                    )}
                  </div>
                </div>

                <div className="catMeta">
                  <span>{cat.skillProfile ?? t(messageKeys.sharedSettingsCatsRegistryDefaultSkillProfileLabel)}</span>
                  <span>
                    {cat.memory.updatedAt
                      ? t(messageKeys.sharedSettingsCatsRegistryMemorySavedLabel)
                      : t(messageKeys.sharedSettingsCatsRegistryNoMemoryYetLabel)}
                  </span>
                  {catBindings.length > 0 ? (
                    <span>
                      {t(messageKeys.sharedSettingsCatsRegistryBotBindingCount, {
                        count: catBindings.length,
                        pluralSuffix: catBindings.length > 1 ? 's' : '',
                      })}
                    </span>
                  ) : null}
                </div>

                {isExpanded ? (
                  <CatsDetailPanelComponent
                    busy={busy}
                    botBindings={botBindings}
                    cat={cat}
                    isBossCat={isBossCat}
                    memoryController={memoryController}
                    registryController={registryController}
                    telegramDiagnostics={telegramDiagnostics}
                    availableSurfaces={availableSurfaces}
                    enabledSurfaces={enabledSurfaces}
                    onPayloadUpdate={onPayloadUpdate}
                    confirm={confirmDialog}
                  />
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="emptyStateCard">
            <p>{t(messageKeys.sharedSettingsCatsRegistryEmptyStateHint)}</p>
          </div>
        )}
      </div>
    </>
  );
}

export type CatsRegistryProps = SharedCatsRegistryProps;

export function CatsRegistry(props: CatsRegistryProps) {
  return (
    <WorkspaceCatsRegistry
      {...props}
      CatsDetailPanelComponent={CatsDetailPanel}
    />
  );
}
