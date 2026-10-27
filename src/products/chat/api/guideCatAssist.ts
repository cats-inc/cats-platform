import { CATLAS_PROMPT_FORMAT, CATLAS_NAVIGATION_FORMAT } from '../../../platform/catlas/assistProtocol.js';
import { createHash, randomUUID } from 'node:crypto';
import type { CatsCoreState, GuideCatRecord } from '../../../core/types.js';
import type { CoreStore } from '../../../core/store.js';
import type { ChatState } from './contracts.js';
import type { ChatStore } from '../state/store.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import { inferCatlasData } from '../../../platform/catlas/inference.js';
import { buildGuideCatAssistRefreshContextHash,
  GUIDE_CAT_ASSIST_SCOPE_KEYS, type GuideCatAssistSurfaceReadModel,
  type GuideCatAssistEntryChip, type GuideCatAssistBundle } from '../../../shared/guideCatAssist.js';
import { createBuiltinGuideCatCatalog, type GuideCatCatalog } from '../../../shared/guideCatAssistCatalog.js';
import { resolveGuideCatAssistBaseline } from '../../../shared/guideCatAssistBaselines.js';
import { readGuideCatAssistCache, readGuideCatAssistConfig } from '../../../shared/guideCatAssistStore.js';
import { appendCatlasReceipt, catlasCooldownIds, readCatlasCatalog, readCatlasSignals,
  updateCatlasCatalog, newCatlasSurfaceState, type CatlasCallKind,
  type CatlasRecommendationPartition, type CatlasReceipt } from '../../../shared/guideCatCurationStore.js';
import { readPlatformPreferences } from '../../../shared/platformPreferences.js';
import { createTranslator, messageKeys, normalizeMessageLocale, type MessageLocale } from '../../../shared/i18n/index.js';
import { buildCatlasSnapshot, catlasSnapshotEntries, internalCatlasSnapshot, type CatlasSnapshot } from './catlasSnapshot.js';
import { applyCatlasCatalogOperations, validateCatlasRecommendations, exactCatlasObject,
  CatlasUnitError } from './catlasCuration.js';

export interface ChatGuideCatAssistReadModel {
  lobby: GuideCatAssistSurfaceReadModel;
  newChat: GuideCatAssistSurfaceReadModel;
  newCode: GuideCatAssistSurfaceReadModel;
  newWork: GuideCatAssistSurfaceReadModel;
}
export interface GuideCatAssistRefreshQueueInput {
  chatStatePath: string;
  guideCat: GuideCatRecord | null;
  ownerDisplayName?: string | null;
  runtimeReachable: boolean;
  now?: Date;
  readModel?: ChatGuideCatAssistReadModel;
  onUpdated?: () => void;
  runtimeClient: RuntimeClient;
  coreStore: CoreStore;
  chatStore: ChatStore;
}
const jobs = new Map<string, { pending: GuideCatAssistRefreshQueueInput | null; promise: Promise<void> }>();
export const CATLAS_ASSIST_TTL_MS = 6 * 60 * 60 * 1000;
export const CATLAS_ATTENTION_REFRESH_MS = 30 * 60 * 1000;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const surfaces = Object.values(GUIDE_CAT_ASSIST_SCOPE_KEYS);
const active = (cat: GuideCatRecord | null): cat is GuideCatRecord => !!cat && cat.status !== 'dismissed';
const binding = (cat: GuideCatRecord | null) => JSON.stringify(cat && [cat.id, cat.executionTarget, cat.modelSelection]);
export async function catlasAssistLocale(statePath: string): Promise<MessageLocale> {
  const prefs = await readPlatformPreferences(statePath);
  return prefs.uiLanguagePreference === 'auto'
    ? normalizeMessageLocale(Intl.DateTimeFormat().resolvedOptions().locale) : prefs.uiLanguagePreference;
}
function contextHash(scopeKey: string, guideCat: GuideCatRecord, ownerDisplayName: string | null | undefined, locale: string) {
  const surfaceId = scopeKey.slice(0, -':default:default'.length);
  return buildGuideCatAssistRefreshContextHash({ scope: { surfaceId, surfaceMode: 'default', audienceState: 'default' },
    guideCat, ownerProfile: { displayName: ownerDisplayName }, locale, assistTemplateRevision: 'catlas-curation-v1' });
}
function attentionHash(snapshot: CatlasSnapshot) {
  return digest([...snapshot.pendingApprovals, ...snapshot.stalledWork, ...snapshot.awaitingReply]
    .map(item => `${item.kind}:${item.id}`).sort());
}
function attemptReady(attempt: { at: string; contextHash: string } | undefined,
  partition: CatlasRecommendationPartition | undefined, hash: string, now: Date): boolean {
  return !attempt || attempt.contextHash !== hash || partition?.refreshContextHash === hash && partition?.refreshedAt === attempt.at
    || now.getTime() - Date.parse(attempt.at) >= CATLAS_ATTENTION_REFRESH_MS;
}
function eligible(partition: CatlasRecommendationPartition | undefined, hash: string, attention: string, now: Date): boolean {
  if (!partition || partition.refreshContextHash !== hash) return true;
  return !!partition.expiresAt && Date.parse(partition.expiresAt) <= now.getTime()
    || partition.attentionHash !== attention && now.getTime() - Date.parse(partition.refreshedAt) >= CATLAS_ATTENTION_REFRESH_MS;
}
function visibleRecommendations(items: GuideCatAssistEntryChip[], snapshot: CatlasSnapshot,
  locale: MessageLocale, hrefFor: (id: string, kind: string) => string | undefined): GuideCatAssistEntryChip[] {
  const byId = new Map(catlasSnapshotEntries(snapshot).map(item => [item.id, item]));
  const t = createTranslator(locale);
  return items.flatMap<GuideCatAssistEntryChip>(item => {
    if (!item.basis?.length || !item.basis.every(id => byId.has(id))) return [];
    if (item.action === 'prefill') return item.basis.every(id => byId.get(id)?.external === false) ? [item] : [];
    const target = byId.get(item.target.id);
    return target && target.kind === item.target.kind && item.basis.includes(target.id)
      ? [{ ...item, href: hrefFor(target.id, target.kind), label: t(messageKeys.guideCatAssistOpen, { title: target.title }) }] : [];
  });
}
function catalogContent(catalog: GuideCatCatalog, surfaceId: string, locale: MessageLocale) {
  const t = createTranslator(locale);
  const greetings = catalog.greetings.filter(item => item.enabled && (item.origin === 'builtin' || item.locale === locale))
    .map(item => ({ id: item.id, text: item.messageKey ? t(item.messageKey) : item.text!,
      ...(item.messageKey ? { messageKey: item.messageKey } : {}) }));
  const chips: GuideCatAssistEntryChip[] = catalog.chips.filter(item => item.enabled && (item.origin === 'builtin' || item.locale === locale))
    .map(item => ({ id: item.id, action: 'prefill', surface: item.surface,
      label: item.labelKey ? t(item.labelKey) : item.label!, prompt: item.promptKey ? t(item.promptKey) : item.prompt!,
      ...(item.labelKey ? { labelKey: item.labelKey, promptKey: item.promptKey } : {}) }));
  return { greetings: greetings.length ? greetings : resolveGuideCatAssistBaseline(surfaceId).content.greetings, entryChips: chips };
}
export async function resolveChatGuideCatAssistReadModel(input: {
  chatStatePath: string; guideCat: GuideCatRecord | null; ownerDisplayName?: string | null;
  runtimeReachable: boolean; now?: Date; core?: CatsCoreState; chat?: ChatState; locale?: MessageLocale;
}): Promise<ChatGuideCatAssistReadModel> {
  const config = await readGuideCatAssistConfig(input.chatStatePath);
  // Validate recognized cache upgrades after preserving config, even though content is composed from catalog state.
  await readGuideCatAssistCache(input.chatStatePath);
  const [catalogs, signals, locale] = await Promise.all([readCatlasCatalog(input.chatStatePath),
    readCatlasSignals(input.chatStatePath, input.now), input.locale ?? catlasAssistLocale(input.chatStatePath)]);
  const now = input.now ?? new Date();
  const snapshot = input.core && input.chat ? buildCatlasSnapshot({ core: input.core, chat: input.chat,
    now, locale, cooldownIds: catlasCooldownIds(signals, now) }) : null;
  const attention = snapshot ? attentionHash(snapshot) : '';
  const hrefFor = (id: string, kind: string): string | undefined => {
    if (kind === 'conversation') {
      const record = input.core?.conversations.find(item => item.id === id);
      const channel = input.chat?.channels.find(item => item.id === (record?.sourceChannelId ?? id));
      return channel ? `/${channel.originSurface ?? 'chat'}/chats/${encodeURIComponent(channel.id)}` : undefined;
    }
    const segment = kind === 'project' ? 'projects' : kind === 'task' ? 'tasks' : 'work-items';
    const product = kind === 'task' ? catlasSnapshotEntries(snapshot!).find(item => item.id === id)?.surface ?? 'work' : 'work';
    return `/${product}/${segment}/${encodeURIComponent(id)}`;
  };
  const resolve = (scopeKey: string): GuideCatAssistSurfaceReadModel => {
    const surfaceId = scopeKey.slice(0, -':default:default'.length);
    const baseline = resolveGuideCatAssistBaseline(surfaceId);
    const stored = catalogs.surfaces[scopeKey];
    const hash = input.guideCat ? contextHash(scopeKey, input.guideCat, input.ownerDisplayName, locale) : '';
    const disabled = config.disabledSurfaceKeys.includes(scopeKey);
    const enabled = active(input.guideCat) && !disabled;
    const promptValid = enabled && stored?.prompt?.refreshContextHash === hash;
    const navValid = enabled && stored?.navigation?.refreshContextHash === hash;
    const content = catalogContent(promptValid ? stored.catalog : createBuiltinGuideCatCatalog(surfaceId), surfaceId, locale);
    const prompt = promptValid && snapshot ? visibleRecommendations(stored.prompt!.recommendations, snapshot, locale, hrefFor) : [];
    const nav = navValid && snapshot ? visibleRecommendations(stored.navigation!.recommendations, snapshot, locale, hrefFor) : [];
    const merged: GuideCatAssistEntryChip[] = [];
    const seenTargets = new Set<string>();
    for (let index = 0; index < Math.max(nav.length, prompt.length); index++) {
      for (const item of surfaceId === 'lobby' ? [nav[index]] : [nav[index], prompt[index]]) {
        if (!item) continue;
        const key = item.action === 'open' ? `${item.target.kind}:${item.target.id}` : item.id;
        if (seenTargets.has(key)) continue;
        seenTargets.add(key); merged.push(item);
      }
    }
    content.entryChips = surfaceId === 'lobby' ? merged.slice(0, 3) : [...merged.slice(0, 3), ...content.entryChips].slice(0, 5);
    const owner = config.ownerOverrides[scopeKey];
    if (owner?.greetings !== undefined) content.greetings = owner.greetings.length
      ? owner.greetings : resolveGuideCatAssistBaseline(surfaceId).content.greetings;
    if (owner?.entryChips !== undefined) content.entryChips = owner.entryChips;
    const partition = stored?.prompt;
    const bundle: GuideCatAssistBundle = { ...baseline, content,
      provenance: { originMode: promptValid || navValid ? 'runtime' : 'deterministic', refreshContextHash: hash },
      freshness: { generatedAt: partition?.refreshedAt ?? new Date(0).toISOString(),
        expiresAt: partition?.expiresAt ?? null, lastRefreshStatus: partition ? 'ok' : 'never' } };
    const refreshEligible = enabled && input.runtimeReachable && config.refreshPreferences.runtimeRefreshEnabled
      && (eligible(stored?.prompt, hash, attention, now) && attemptReady(stored?.attemptedAt?.prompt, stored?.prompt, hash, now)
        || snapshot !== null && catlasSnapshotEntries(snapshot).length > 0
          && eligible(stored?.navigation, hash, attention, now) && attemptReady(stored?.attemptedAt?.navigation, stored?.navigation, hash, now));
    return { scopeKey, bundle, renderSource: promptValid || navValid ? 'cache' : 'deterministic',
      cacheHit: !!stored, missing: !stored, stale: !!partition && eligible(partition, hash, attention, now),
      refreshEligible, surfaceDisabled: disabled, lastFailure: null };
  };
  return { lobby: resolve(GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault), newChat: resolve(GUIDE_CAT_ASSIST_SCOPE_KEYS.chatNewDefault),
    newCode: resolve(GUIDE_CAT_ASSIST_SCOPE_KEYS.codeNewDefault), newWork: resolve(GUIDE_CAT_ASSIST_SCOPE_KEYS.workNewDefault) };
}

export async function refreshGuideCatAssistEligibleScopes(input: GuideCatAssistRefreshQueueInput): Promise<void> {
  if (!active(input.guideCat) || !input.runtimeReachable) return;
  const config = await readGuideCatAssistConfig(input.chatStatePath);
  if (!config.refreshPreferences.runtimeRefreshEnabled) return;
  await readGuideCatAssistCache(input.chatStatePath);
  const [core, chat, locale, signals, stored] = await Promise.all([input.coreStore.readCore(), input.chatStore.read(),
    catlasAssistLocale(input.chatStatePath), readCatlasSignals(input.chatStatePath, input.now), readCatlasCatalog(input.chatStatePath)]);
  if (!active(core.guideCat) || binding(core.guideCat) !== binding(input.guideCat)) return;
  const guideCat = core.guideCat;
  const now = input.now ?? new Date();
  const snapshot = buildCatlasSnapshot({ core, chat, locale, now, cooldownIds: catlasCooldownIds(signals, now) });
  const attention = attentionHash(snapshot);
  for (const kind of ['refresh_prompt', 'refresh_navigation'] as const) {
    const partitionKey = kind === 'refresh_prompt' ? 'prompt' : 'navigation';
    const requestSnapshot = kind === 'refresh_prompt' ? internalCatlasSnapshot(snapshot) : snapshot;
    if (kind === 'refresh_navigation' && !catlasSnapshotEntries(snapshot).length) continue;
    const requestedScopes = surfaces.filter(key => !config.disabledSurfaceKeys.includes(key)
      && eligible(stored.surfaces[key]?.[partitionKey], contextHash(key, guideCat, core.ownerProfile.displayName, locale), attention, now)
      && attemptReady(stored.surfaces[key]?.attemptedAt?.[partitionKey], stored.surfaces[key]?.[partitionKey],
        contextHash(key, guideCat, core.ownerProfile.displayName, locale), now));
    if (!requestedScopes.length) continue;
    const latestCore = await input.coreStore.readCore();
    const latestConfig = await readGuideCatAssistConfig(input.chatStatePath);
    if (!active(latestCore.guideCat) || binding(latestCore.guideCat) !== binding(guideCat)
      || !latestConfig.refreshPreferences.runtimeRefreshEnabled || !(await input.runtimeClient.getHealth()).reachable) return;
    const allowedScopes = requestedScopes.filter(key => !latestConfig.disabledSurfaceKeys.includes(key));
    if (!allowedScopes.length) continue;
    const translate = createTranslator(locale);
    const payload = { snapshot: requestSnapshot, scopes: allowedScopes.map(scopeKey => ({ scopeKey,
      ...(kind === 'refresh_prompt' ? { catalog: stored.surfaces[scopeKey]?.catalog
        ?? createBuiltinGuideCatCatalog(scopeKey.slice(0, -':default:default'.length)) } : {}) })) };
    if (kind === 'refresh_prompt') {
      for (const scope of payload.scopes) {
        if (!scope.catalog) continue;
        scope.catalog = { greetings: scope.catalog.greetings.map(item => item.messageKey
          ? { ...item, text: translate(item.messageKey) } : item),
        chips: scope.catalog.chips.map(item => item.labelKey && item.promptKey
          ? { ...item, label: translate(item.labelKey), prompt: translate(item.promptKey) } : item) };
      }
    }

    await updateCatlasCatalog(input.chatStatePath, current => {
      for (const key of allowedScopes) {
        const surface = current.surfaces[key] ?? newCatlasSurfaceState(key.slice(0, -':default:default'.length));
        surface.attemptedAt = { ...surface.attemptedAt, [partitionKey]: { at: now.toISOString(), contextHash: contextHash(key, guideCat, core.ownerProfile.displayName, locale) } };
        current.surfaces[key] = surface;
      }
    });
    const receipt: CatlasReceipt = { requestId: randomUUID(), kind, provider: guideCat.executionTarget.provider,
      model: guideCat.executionTarget.model ?? null, inputDigest: digest(payload), timestamp: now.toISOString(), units: [] };
    try {
      const output = await inferCatlasData({ runtimeClient: input.runtimeClient, guideCat, kind, payload,
        requestId: receipt.requestId, onSession: session => { receipt.provider = session.provider; receipt.model = session.model; }, signal: AbortSignal.timeout(90_000), format: kind === 'refresh_prompt' ? CATLAS_PROMPT_FORMAT : CATLAS_NAVIGATION_FORMAT });
      const envelope = exactCatlasObject(output, ['surfaces']);
      if (!Array.isArray(envelope.surfaces) || envelope.surfaces.length > allowedScopes.length) throw new CatlasUnitError('invalid_envelope');
      const afterCore = await input.coreStore.readCore();
      const afterConfig = await readGuideCatAssistConfig(input.chatStatePath);
      if (!active(afterCore.guideCat) || binding(afterCore.guideCat) !== binding(guideCat)
        || !afterConfig.refreshPreferences.runtimeRefreshEnabled || await catlasAssistLocale(input.chatStatePath) !== locale) throw new CatlasUnitError('context_changed');
      const scopeCounts = new Map<string, number>();
      for (const unit of envelope.surfaces) {
        if (unit && typeof unit.scopeKey === 'string') scopeCounts.set(unit.scopeKey, (scopeCounts.get(unit.scopeKey) ?? 0) + 1);
      }
      for (const raw of envelope.surfaces) {
        let id = 'unknown';
        try {
          const unit = exactCatlasObject(raw, kind === 'refresh_prompt' ? ['scopeKey', 'operations', 'recommendations'] : ['scopeKey', 'recommendations']);
          if (typeof unit.scopeKey !== 'string' || !allowedScopes.includes(unit.scopeKey as typeof surfaces[number])) throw new CatlasUnitError('unknown_scope');
          id = unit.scopeKey;
          if (scopeCounts.get(id) !== 1 || afterConfig.disabledSurfaceKeys.includes(id)) throw new CatlasUnitError('invalid_scope');
          const recommendations = validateCatlasRecommendations(unit.recommendations, kind, requestSnapshot, id.startsWith('lobby:'));
          let appliedOperations: unknown[] = [];
          await updateCatlasCatalog(input.chatStatePath, current => {
            const surface = current.surfaces[id] ?? newCatlasSurfaceState(id.slice(0, -':default:default'.length));
            let operations: unknown[] = [];
            if (kind === 'refresh_prompt') {
              const result = applyCatlasCatalogOperations(payload.scopes.find(scope => scope.scopeKey === id)!.catalog!, unit.operations, locale, id.startsWith('lobby:'));
              surface.catalog = result.catalog; operations = result.operations;
            }
            surface[partitionKey] = { recommendations, refreshContextHash: contextHash(id, guideCat, core.ownerProfile.displayName, locale),
              refreshedAt: now.toISOString(), expiresAt: config.refreshPreferences.defaultTtlMs !== null && config.refreshPreferences.defaultTtlMs <= 0 ? null
                : new Date(now.getTime() + (config.refreshPreferences.defaultTtlMs ?? CATLAS_ASSIST_TTL_MS)).toISOString(), attentionHash: attention };
            current.surfaces[id] = surface;
            appliedOperations = operations;
          });
          receipt.units.push({ id, outcome: 'applied', reasons: [], operations: appliedOperations });
        } catch (error) { receipt.units.push({ id, outcome: 'rejected', reasons: [error instanceof CatlasUnitError ? error.code : 'apply_failed'] }); }
      }
    } catch (error) {
      receipt.units = allowedScopes.map(id => ({ id, outcome: 'rejected', reasons: [error instanceof CatlasUnitError ? error.code : 'call_failed'] }));
    }
    await appendCatlasReceipt(input.chatStatePath, receipt);
    if (receipt.units.some(unit => unit.outcome === 'applied')) input.onUpdated?.();
  }
}
export function queueGuideCatAssistRefresh(input: GuideCatAssistRefreshQueueInput): void {
  if (!active(input.guideCat) || !input.runtimeReachable) return;
  const existing = jobs.get(input.chatStatePath);
  if (existing) { existing.pending = input; return; }
  const job = { pending: null as GuideCatAssistRefreshQueueInput | null, promise: Promise.resolve() };
  jobs.set(input.chatStatePath, job);
  job.promise = (async () => {
    try {
      let next: GuideCatAssistRefreshQueueInput | null = input;
      while (next) {
        await refreshGuideCatAssistEligibleScopes(next).catch(error => console.error('[catlas-assist] refresh failed', error instanceof Error ? error.name : 'unknown'));
        next = job.pending; job.pending = null;
      }
    } finally { jobs.delete(input.chatStatePath); }
  })();
}
export async function waitForGuideCatAssistRefreshIdle(statePath: string): Promise<void> {
  await jobs.get(statePath)?.promise;
}
