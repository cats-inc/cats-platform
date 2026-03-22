import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AppShellPayload, ChatCat, BotBindingSummary } from '../../../../shared/app-shell';
import { executionLabel, emptyCatForm, type CatFormState } from '../chatUtils';
import {
  createGlobalCat,
  deleteGlobalCat,
  updateCatProfile,
  createBotBindingApi,
  deleteBotBindingApi,
  listCatMemory,
  createCatMemory,
  deleteCatMemory,
  type DurableMemoryItem,
} from '../api';
import { ProviderModelFields } from './ProviderModelFields';

const SKILL_PROFILES = [
  { value: 'chat-default', label: 'Default' },
  { value: 'companion', label: 'Companion' },
];

const MEMORY_CATEGORIES = [
  'preference', 'fact', 'policy', 'style', 'relationship', 'lesson',
];

export interface SettingsCatsProps {
  payload: AppShellPayload;
  feedback: string;
  busy: string;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
  onBusy: (key: string) => void;
}

export function SettingsCats({
  payload,
  feedback,
  busy,
  onPayloadUpdate,
  onFeedback,
  onBusy,
}: SettingsCatsProps) {
  const navigate = useNavigate();
  const [catForm, setCatForm] = useState<CatFormState>(emptyCatForm);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [botForm, setBotForm] = useState({ botName: '', botToken: '', webhookSecret: '' });
  const [memoryForm, setMemoryForm] = useState({ category: 'fact', content: '' });
  const [catMemory, setCatMemory] = useState<DurableMemoryItem[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);

  useEffect(() => {
    if (!expandedCatId) return;
    let cancelled = false;
    setMemoryLoading(true);
    listCatMemory(expandedCatId)
      .then((items) => { if (!cancelled) setCatMemory(items); })
      .catch(() => { if (!cancelled) setCatMemory([]); })
      .finally(() => { if (!cancelled) setMemoryLoading(false); });
    return () => { cancelled = true; };
  }, [expandedCatId]);

  async function onCreateCat(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    onBusy('cat:create');
    try {
      const result = await createGlobalCat({
        name: catForm.name,
        provider: catForm.provider,
        instance: catForm.instance || undefined,
        model: catForm.model || undefined,
      });
      onPayloadUpdate(result);
      setCatForm(emptyCatForm());
      onFeedback('Cat saved.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to save cat.');
    } finally {
      onBusy('');
    }
  }

  async function onRenameCat(catId: string): Promise<void> {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    onBusy(`cat:rename:${catId}`);
    try {
      const result = await updateCatProfile(catId, { name: trimmed });
      onPayloadUpdate(result);
      setRenameValue('');
      onFeedback('Cat renamed.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to rename cat.');
    } finally {
      onBusy('');
    }
  }

  async function onMakeBossCat(catId: string): Promise<void> {
    onBusy(`cat:makeBoss:${catId}`);
    try {
      const result = await updateCatProfile(catId, { makeBoss: true });
      onPayloadUpdate(result);
      onFeedback('Boss Cat updated.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to set Boss Cat.');
    } finally {
      onBusy('');
    }
  }

  async function onSkillChange(catId: string, skillProfile: string): Promise<void> {
    onBusy(`cat:skill:${catId}`);
    try {
      const result = await updateCatProfile(catId, {
        skillProfile: skillProfile === 'chat-default' ? null : skillProfile,
      });
      onPayloadUpdate(result);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to update skill.');
    } finally {
      onBusy('');
    }
  }

  async function onCreateBinding(catId: string): Promise<void> {
    if (!botForm.botName.trim()) return;
    onBusy('bot:create');
    try {
      const result = await createBotBindingApi({
        botName: botForm.botName.trim(),
        boundCatId: catId,
        botToken: botForm.botToken.trim() || undefined,
        webhookSecret: botForm.webhookSecret.trim() || undefined,
      });
      onPayloadUpdate(result);
      setBotForm({ botName: '', botToken: '', webhookSecret: '' });
      onFeedback('Telegram bot binding created.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to create binding.');
    } finally {
      onBusy('');
    }
  }

  async function onDeleteBinding(bindingId: string): Promise<void> {
    onBusy(`bot:delete:${bindingId}`);
    try {
      const result = await deleteBotBindingApi(bindingId);
      onPayloadUpdate(result);
      onFeedback('Binding removed.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to remove binding.');
    } finally {
      onBusy('');
    }
  }

  async function onAddMemory(catId: string): Promise<void> {
    if (!memoryForm.content.trim()) return;
    onBusy('memory:create');
    try {
      const items = await createCatMemory(catId, {
        category: memoryForm.category,
        content: memoryForm.content.trim(),
      });
      setCatMemory(items);
      setMemoryForm({ category: 'fact', content: '' });
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to save memory.');
    } finally {
      onBusy('');
    }
  }

  async function onDeleteMemory(catId: string, memoryId: string): Promise<void> {
    onBusy(`memory:delete:${memoryId}`);
    try {
      await deleteCatMemory(catId, memoryId);
      setCatMemory((prev) => prev.filter((m) => m.id !== memoryId));
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to delete memory.');
    } finally {
      onBusy('');
    }
  }

  const botBindings = payload.chat.botBindings ?? [];

  return (
    <div className="settingsShell">
      <nav className="settingsSidebar">
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/general')}>General</button>
        <button className="settingsTab settingsTabActive" type="button" onClick={() => navigate('/settings/cats')}>Cats</button>
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/data')}>Data</button>
      </nav>
      <div className="settingsContent">
        <div className="viewIntro">
          <h1>Cats</h1>
          <p className="heroNote">
            Manage your cats, assign skills, bind Telegram bots, and view memory.
          </p>
          {feedback ? <p className="feedbackText">{feedback}</p> : null}
        </div>

        <div className="catsLayout">
          <section className="contentCard">
            <div className="contentCardHeader">
              <div>
                <p className="sectionLabel">Registry</p>
                <h2>{payload.chat.cats.length > 0 ? 'Saved cats' : 'No cats yet'}</h2>
              </div>
              <span className="countBadge">{payload.chat.cats.length}</span>
            </div>

            <div className="catList">
              {payload.chat.cats.length > 0 ? (
                [...payload.chat.cats]
                  .sort((a, b) => {
                    const aIsBoss = a.id === payload.chat.bossCatId ? 0 : 1;
                    const bIsBoss = b.id === payload.chat.bossCatId ? 0 : 1;
                    return aIsBoss - bIsBoss;
                  })
                  .map((cat) => {
                    const isBossCat = cat.id === payload.chat.bossCatId;
                    const isExpanded = expandedCatId === cat.id;
                    const catBindings = botBindings.filter((b) => b.boundCatId === cat.id);

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
                              {isBossCat ? <span className="statusChip statusChipAccent">Boss Cat</span> : null}
                            </div>
                            <p>{executionLabel(cat)}</p>
                          </div>
                          <div style={{ display: 'flex', alignSelf: 'start', alignItems: 'center', gap: 8 }}>
                            <span
                              className={
                                cat.status === 'active'
                                  ? 'statusChip statusChipReady'
                                  : 'statusChip statusChipMuted'
                              }
                            >
                              {cat.status}
                            </span>
                            {!isBossCat ? (
                              <button
                                className="chromeButton"
                                type="button"
                                disabled={busy === `cat:delete:${cat.id}`}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  onBusy(`cat:delete:${cat.id}`);
                                  onFeedback('');
                                  try {
                                    const next = await deleteGlobalCat(cat.id);
                                    onPayloadUpdate(next);
                                    onFeedback(`${cat.name} deleted.`);
                                    if (expandedCatId === cat.id) setExpandedCatId(null);
                                  } catch (err) {
                                    onFeedback(err instanceof Error ? err.message : 'Failed to delete cat');
                                  } finally {
                                    onBusy('');
                                  }
                                }}
                                title={`Delete ${cat.name}`}
                              >
                                &#x2715;
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="catMeta">
                          <span>{cat.skillProfile ?? 'Default'}</span>
                          <span>{cat.memory.updatedAt ? 'Memory saved' : 'No memory yet'}</span>
                          {catBindings.length > 0 ? <span>{catBindings.length} bot{catBindings.length > 1 ? 's' : ''}</span> : null}
                        </div>

                        {isExpanded ? (
                          <div className="catDetailPanel">
                            {/* Rename */}
                            <div className="catDetailSection">
                              <p className="sectionLabel">Rename</p>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                  className="textInput"
                                  placeholder={cat.name}
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onFocus={() => setRenameValue(cat.name)}
                                />
                                <button
                                  className="primaryButton"
                                  type="button"
                                  disabled={!renameValue.trim() || renameValue.trim() === cat.name || busy === `cat:rename:${cat.id}`}
                                  onClick={() => void onRenameCat(cat.id)}
                                >
                                  {busy === `cat:rename:${cat.id}` ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>

                            {/* Make Boss Cat */}
                            {!isBossCat ? (
                              <div className="catDetailSection">
                                <p className="sectionLabel">Boss Cat</p>
                                <button
                                  className="primaryButton"
                                  type="button"
                                  disabled={busy === `cat:makeBoss:${cat.id}`}
                                  onClick={() => {
                                    if (window.confirm(`Make ${cat.name} the Boss Cat? This will change the default lead for new chats.`)) {
                                      void onMakeBossCat(cat.id);
                                    }
                                  }}
                                >
                                  {busy === `cat:makeBoss:${cat.id}` ? 'Setting...' : `Make ${cat.name} the Boss Cat`}
                                </button>
                              </div>
                            ) : null}

                            {/* Skill Profile */}
                            <div className="catDetailSection">
                              <p className="sectionLabel">Skill Profile</p>
                              <div className="skillPills">
                                {SKILL_PROFILES.map((sp) => (
                                  <button
                                    key={sp.value}
                                    className={(cat.skillProfile ?? 'chat-default') === sp.value ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
                                    type="button"
                                    disabled={busy === `cat:skill:${cat.id}`}
                                    onClick={() => void onSkillChange(cat.id, sp.value)}
                                  >
                                    {sp.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Telegram Bot Bindings */}
                            <div className="catDetailSection">
                              <p className="sectionLabel">Telegram Bot</p>
                              {catBindings.length > 0 ? (
                                <div className="botBindingList">
                                  {catBindings.map((binding) => (
                                    <div key={binding.id} className="botBindingItem">
                                      <div>
                                        <strong>@{binding.botName}</strong>
                                        <span className="statusChip statusChipReady" style={{ marginLeft: 8 }}>{binding.status}</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8em', opacity: 0.6 }}>/api/transports/telegram/webhook/{binding.id}</span>
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
                              <div className="botBindingForm">
                                <input
                                  className="textInput"
                                  placeholder="Bot username (e.g. my_cat_bot)"
                                  value={botForm.botName}
                                  onChange={(e) => setBotForm({ ...botForm, botName: e.target.value })}
                                />
                                <input
                                  className="textInput"
                                  placeholder="Bot token (optional)"
                                  type="password"
                                  value={botForm.botToken}
                                  onChange={(e) => setBotForm({ ...botForm, botToken: e.target.value })}
                                />
                                <input
                                  className="textInput"
                                  placeholder="Webhook secret (optional)"
                                  value={botForm.webhookSecret}
                                  onChange={(e) => setBotForm({ ...botForm, webhookSecret: e.target.value })}
                                />
                                <button
                                  className="primaryButton"
                                  type="button"
                                  disabled={!botForm.botName.trim() || busy === 'bot:create'}
                                  onClick={() => void onCreateBinding(cat.id)}
                                >
                                  {busy === 'bot:create' ? 'Creating...' : 'Add Telegram Bot'}
                                </button>
                              </div>
                            </div>

                            {/* Memory */}
                            <div className="catDetailSection">
                              <p className="sectionLabel">Memory ({memoryLoading ? '...' : catMemory.length})</p>
                              {catMemory.length > 0 ? (
                                <div className="memoryList">
                                  {catMemory.map((mem) => (
                                    <div key={mem.id} className="memoryItem">
                                      <div>
                                        <span className="statusChip statusChipMuted">{mem.category}</span>
                                        <span style={{ marginLeft: 8 }}>{mem.content.slice(0, 100)}{mem.content.length > 100 ? '...' : ''}</span>
                                      </div>
                                      <button
                                        className="chromeButton"
                                        type="button"
                                        disabled={busy === `memory:delete:${mem.id}`}
                                        onClick={() => void onDeleteMemory(cat.id, mem.id)}
                                      >
                                        &#x2715;
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : !memoryLoading ? (
                                <p style={{ opacity: 0.6, marginBottom: 8 }}>No memory records yet.</p>
                              ) : null}
                              <div className="memoryForm">
                                <select
                                  className="textInput"
                                  value={memoryForm.category}
                                  onChange={(e) => setMemoryForm({ ...memoryForm, category: e.target.value })}
                                >
                                  {MEMORY_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                                <textarea
                                  className="textInput"
                                  rows={2}
                                  placeholder="Memory content..."
                                  value={memoryForm.content}
                                  onChange={(e) => setMemoryForm({ ...memoryForm, content: e.target.value })}
                                />
                                <button
                                  className="primaryButton"
                                  type="button"
                                  disabled={!memoryForm.content.trim() || busy === 'memory:create'}
                                  onClick={() => void onAddMemory(cat.id)}
                                >
                                  {busy === 'memory:create' ? 'Saving...' : 'Add Memory'}
                                </button>
                              </div>
                            </div>
                          </div>
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
          </section>

          <section className="contentCard contentCardForm">
            <div className="contentCardHeader">
              <div>
                <p className="sectionLabel">Create</p>
                <h2>New cat</h2>
              </div>
            </div>
            <form
              className="stackForm"
              onSubmit={(event) => void onCreateCat(event)}
            >
              <label className="fieldLabel">
                <span>Name</span>
                <input
                  className="textInput"
                  value={catForm.name}
                  onChange={(event) => setCatForm({ ...catForm, name: event.target.value })}
                  placeholder="Ops reviewer"
                />
              </label>
              <ProviderModelFields
                provider={catForm.provider}
                instance={catForm.instance}
                model={catForm.model}
                onTargetChange={(target) =>
                  setCatForm({
                    ...catForm,
                    provider: target.provider,
                    instance: target.instance,
                    model: target.model,
                  })}
              />
              <button
                className="primaryButton"
                disabled={!catForm.name.trim() || !catForm.provider.trim() || !catForm.model.trim()}
                type="submit"
              >
                {busy === 'cat:create' ? 'Saving...' : 'Save Cat'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
