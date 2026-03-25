import type { Dispatch, SetStateAction } from 'react';

import type { AppShellPayload } from '../../../api/contracts';
import type { TelegramTransportDiagnostics } from '../../api';
import { executionLabel } from '../../chatUtils';
import type { SettingsCatsMemoryController } from '../../hooks/useSettingsCatsMemory';
import type { BotFormState } from '../../hooks/useSettingsCatsRegistryActions';
import { SettingsCatsDetailPanel } from './SettingsCatsDetailPanel';

interface SettingsCatsRegistryController {
  botForm: BotFormState;
  renameValue: string;
  setBotForm: Dispatch<SetStateAction<BotFormState>>;
  setRenameValue: Dispatch<SetStateAction<string>>;
  onCreateBinding: (catId: string) => Promise<void>;
  onDeleteBinding: (bindingId: string) => Promise<void>;
  onDeleteCat: (catId: string, catName: string) => Promise<void>;
  onMakeBossCat: (catId: string) => Promise<void>;
  onRenameCat: (catId: string) => Promise<void>;
  onSkillChange: (catId: string, skillProfile: string) => Promise<void>;
  onUpdateProducts: (catId: string, products: string[]) => Promise<void>;
}

export interface SettingsCatsRegistryProps {
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  busy: string;
  expandedCatId: string | null;
  memoryController: SettingsCatsMemoryController;
  payload: AppShellPayload;
  registryController: SettingsCatsRegistryController;
  setExpandedCatId: Dispatch<SetStateAction<string | null>>;
  telegramDiagnostics: TelegramTransportDiagnostics | null;
  availableSurfaces?: string[];
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export function SettingsCatsRegistry({
  botBindings,
  busy,
  expandedCatId,
  memoryController,
  payload,
  registryController,
  setExpandedCatId,
  telegramDiagnostics,
  availableSurfaces,
  confirm: confirmDialog,
}: SettingsCatsRegistryProps) {
  const sortedCats = [...payload.chat.cats].sort((left, right) => {
    const leftRank = left.id === payload.chat.bossCatId ? 0 : 1;
    const rightRank = right.id === payload.chat.bossCatId ? 0 : 1;
    return leftRank - rightRank;
  });

  return (
    <>
      <div className="contentCardHeader">
        <div>
          <p className="sectionLabel">Registry</p>
          <h2>{payload.chat.cats.length > 0 ? 'Saved cats' : 'No cats yet'}</h2>
        </div>
        <span className="countBadge">{payload.chat.cats.length}</span>
      </div>

      <div className="catList">
        {sortedCats.length > 0 ? (
          sortedCats.map((cat) => {
            const isBossCat = cat.id === payload.chat.bossCatId;
            const isExpanded = expandedCatId === cat.id;
            const catBindings = botBindings.filter((binding) => binding.catId === cat.id);

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
                        <span className="statusChip statusChipAccent">Boss Cat</span>
                      ) : null}
                    </div>
                    <p>{executionLabel(cat)}</p>
                    {cat.products.length > 0 ? (
                      <div className="chipRow" style={{ marginTop: 4 }}>
                        {cat.products.map((surface) => (
                          <span key={surface} className="productBadge">{surface}</span>
                        ))}
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
                      {cat.status}
                    </span>
                    <button
                      className="chromeButton"
                      type="button"
                      disabled={busy === `cat:delete:${cat.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void registryController.onDeleteCat(cat.id, cat.name);
                      }}
                      data-tooltip={`Delete ${cat.name}`}
                    >
                      &#x2715;
                    </button>
                  </div>
                </div>

                <div className="catMeta">
                  <span>{cat.skillProfile ?? 'Default'}</span>
                  <span>{cat.memory.updatedAt ? 'Memory saved' : 'No memory yet'}</span>
                  {catBindings.length > 0 ? (
                    <span>{catBindings.length} bot{catBindings.length > 1 ? 's' : ''}</span>
                  ) : null}
                </div>

                {isExpanded ? (
                  <SettingsCatsDetailPanel
                    busy={busy}
                    botBindings={botBindings}
                    cat={cat}
                    isBossCat={isBossCat}
                    memoryController={memoryController}
                    registryController={registryController}
                    telegramDiagnostics={telegramDiagnostics}
                    availableSurfaces={availableSurfaces}
                    confirm={confirmDialog}
                  />
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="emptyStateCard">
            <p>Create your first cat from the panel on the right.</p>
          </div>
        )}
      </div>
    </>
  );
}
