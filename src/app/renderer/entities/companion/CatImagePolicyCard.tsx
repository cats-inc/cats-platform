import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatsImageCapabilitiesV2, CatsImageJobV2 } from '#cats-app-format';
import { ToastContainer, useToast } from '../../../../design/components/Toast.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { catImageAttachmentUrl } from '../../../../shared/catImageAttachments.js';
import { useI18n } from '../../i18n/useI18n.js';

interface Policy {
  revision: number; enabled: boolean; manual: boolean; proactive: boolean;
  targetId: string; profileId: string; profileRevision: string; agentConfigId: string;
  dailyLimit: number; totalLimit: number; minIntervalMinutes: number;
  timeZone: string; windowStart: string; windowEnd: string; expiresAt: string; bindingId: string;
}
interface Status {
  policy: Policy | null; ready: boolean; capabilities: CatsImageCapabilitiesV2 | null;
  bindings: Array<{ id: string; name: string; linked: boolean }>;
  budget: { dailyUsed: number; totalUsed: number } | null;
  jobs: Array<CatsImageJobV2 & { delivery: { status: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'suppressed'; abandonedAt?: string | null } | null }>;
}
const fields = ['enabled', 'manual', 'proactive', 'targetId', 'profileId', 'profileRevision', 'agentConfigId',
  'dailyLimit', 'totalLimit', 'minIntervalMinutes', 'timeZone', 'windowStart', 'windowEnd', 'expiresAt', 'bindingId'] as const;
const policyPath = (catId: string) => `/api/cats/${encodeURIComponent(catId)}/image-policy`;

async function json(response: Response): Promise<Status> {
  if (!response.ok) throw new Error('image_policy_unavailable');
  return response.json() as Promise<Status>;
}
function draftFor(status: Status): Policy {
  if (status.policy) return { ...status.policy };
  const profile = status.capabilities?.profiles[0];
  return { revision: 0, enabled: false, manual: true, proactive: false,
    targetId: profile?.targetIds[0] ?? '', profileId: profile?.id ?? '', profileRevision: String(profile?.revision ?? ''),
    agentConfigId: profile?.agentConfigs[0]?.id ?? '', dailyLimit: 1, totalLimit: 10, minIntervalMinutes: 60,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, windowStart: '07:00', windowEnd: '22:00',
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), bindingId: status.bindings.find(binding => binding.linked)?.id ?? status.bindings[0]?.id ?? '' };
}
function localDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function CatImagePolicyCard({ catId }: { catId: string }) {
  const { t } = useI18n(); const { toasts, showToast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false); const loadFailed = useRef(false);
  const retainedCapabilities = useRef<CatsImageCapabilitiesV2 | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await json(await fetch(policyPath(catId), { signal, headers: { Accept: 'application/json' } }));
      if (next.capabilities) retainedCapabilities.current = next.capabilities;
      const retained = { ...next, capabilities: retainedCapabilities.current };
      setStatus(retained);
      if (!dirty.current) setDraft(draftFor(retained));
      loadFailed.current = false;
    } catch {
      if (!signal?.aborted && !loadFailed.current) { showToast(t(messageKeys.catImagesLoadError)); loadFailed.current = true; }
    }
  }, [catId, showToast, t]);
  useEffect(() => {
    const abort = new AbortController(); dirty.current = false; loadFailed.current = false; retainedCapabilities.current = null;
    setStatus(null); setDraft(null); void refresh(abort.signal);
    const timer = setInterval(() => { void refresh(abort.signal); }, 10000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [refresh]);
  const update = <K extends keyof Policy>(key: K, value: Policy[K]) => {
    dirty.current = true; setDraft(previous => previous ? { ...previous, [key]: value } : previous);
  };
  async function save() {
    if (!draft) return; setSaving(true);
    try {
      const input = { revision: draft.revision, ...Object.fromEntries(fields.map(key => [key, draft[key]])) };
      const next = await json(await fetch(policyPath(catId), { method: 'PUT',
        headers: { 'content-type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(input) }));
      setStatus(next); setDraft(draftFor(next)); dirty.current = false; showToast(t(messageKeys.catImagesSaved));
    } catch { showToast(t(messageKeys.catImagesSaveError)); }
    finally { setSaving(false); }
  }
  async function retry(job: Status['jobs'][number]) {
    if (job.delivery?.status === 'uncertain' && !window.confirm(t(messageKeys.catImagesRetryConfirm))) return;
    setSaving(true);
    try {
      await json(await fetch(`/api/cats/${encodeURIComponent(catId)}/images/${job.id}/retry`, { method: 'POST' }));
      await refresh(); showToast(t(messageKeys.catImagesRetryQueued));
    } catch { showToast(t(messageKeys.catImagesSaveError)); }
    finally { setSaving(false); }
  }
  async function cancel(id: string, uncertain = false) {
    if (uncertain && !window.confirm(t(messageKeys.catImagesStopConfirm))) return;
    setSaving(true);
    try { await json(await fetch(`/api/cats/${encodeURIComponent(catId)}/images/${id}/cancel`, { method: 'POST' })); await refresh(); }
    catch { showToast(t(messageKeys.catImagesSaveError)); }
    finally { setSaving(false); }
  }
  const phases = {
    submitting: messageKeys.catImagesQueued, running: messageKeys.catImagesGenerating, collecting: messageKeys.catImagesGenerating,
    succeeded: messageKeys.catImagesWaitingDelivery, failed: messageKeys.catImagesGenerationFailed, cancelling: messageKeys.catImagesCancelling,
    cancelled: messageKeys.catImagesCancelled, interrupted: messageKeys.catImagesUnknown,
  };
  const deliveryPhases = { pending: messageKeys.catImagesWaitingDelivery, sending: messageKeys.catImagesSending,
    sent: messageKeys.catImagesSent, failed: messageKeys.catImagesDeliveryFailed, uncertain: messageKeys.catImagesUncertain,
    suppressed: messageKeys.catImagesSuppressed };
  return <section className="companionCard" aria-label={t(messageKeys.catImagesTitle)}>
    <ToastContainer toasts={toasts} />
    <div className="companionCardHeader">{t(messageKeys.catImagesTitle)}</div>
    <p>{t(messageKeys.catImagesDescription)}</p>
    {!status || !draft ? <p role="status">{t(messageKeys.catImagesLoading)}</p> : <>
      {!status.ready ? <p>{t(messageKeys.catImagesReadinessHint)}</p> : null}
      <label className="companionFormRow"><span>{t(messageKeys.catImagesEnabled)}</span>
        <input type="checkbox" checked={draft.enabled} disabled={saving || (!status.ready && !draft.enabled)} onChange={event => update('enabled', event.target.checked)} /></label>
      <label className="companionFormRow"><span>{t(messageKeys.catImagesManual)}</span>
        <input type="checkbox" checked={draft.manual} disabled={saving} onChange={event => update('manual', event.target.checked)} /></label>
      <label className="companionFormRow"><span>{t(messageKeys.catImagesProactive)}</span>
        <input type="checkbox" checked={draft.proactive} disabled={saving} onChange={event => update('proactive', event.target.checked)} /></label>
      <label className="companionFormRow"><span>{t(messageKeys.catImagesProvider)}</span><select disabled={saving}
        value={JSON.stringify([draft.profileId, draft.targetId])} onChange={event => {
          const [id, targetId] = JSON.parse(event.target.value) as [string, string];
          const profile = status.capabilities?.profiles.find(row => row.id === id);
          if (profile) { dirty.current = true; setDraft({ ...draft, profileId: profile.id, profileRevision: String(profile.revision),
            targetId, agentConfigId: profile.agentConfigs[0]!.id }); }
        }}>
        {status.capabilities?.profiles.flatMap(profile => profile.targetIds.map(target => <option key={`${profile.id}:${target}`}
          value={JSON.stringify([profile.id, target])}>{target} · {profile.agentConfigs[0]?.model}</option>))}
      </select></label>
      <label className="companionFormRow"><span>{t(messageKeys.catImagesBinding)}</span><select disabled={saving}
        value={draft.bindingId} onChange={event => update('bindingId', event.target.value)}>
        {status.bindings.map(binding => <option key={binding.id} value={binding.id} disabled={!binding.linked}>{binding.name}</option>)}
      </select></label>
      {(['dailyLimit', 'totalLimit', 'minIntervalMinutes'] as const).map((key, index) => <label className="companionFormRow" key={key}>
        <span>{t([messageKeys.catImagesDailyLimit, messageKeys.catImagesTotalLimit, messageKeys.catImagesInterval][index]!)}</span>
        <input type="number" min={1} max={[100, 10000, 10080][index]} value={draft[key]} disabled={saving}
          onChange={event => update(key, Number(event.target.value))} /></label>)}
      <label className="companionFormRow"><span>{t(messageKeys.catImagesTimeZone)}</span><input value={draft.timeZone} disabled={saving}
        onChange={event => update('timeZone', event.target.value)} /></label>
      <label className="companionFormRow"><span>{t(messageKeys.catImagesWindow)}</span>
        <input type="time" value={draft.windowStart} disabled={saving} onChange={event => update('windowStart', event.target.value)} />
        <span>–</span><input type="time" value={draft.windowEnd} disabled={saving} onChange={event => update('windowEnd', event.target.value)} /></label>
      <label className="companionFormRow"><span>{t(messageKeys.catImagesExpiry)}</span><input type="datetime-local"
        value={localDateTime(draft.expiresAt)} disabled={saving} onChange={event => update('expiresAt', event.target.value ? new Date(event.target.value).toISOString() : '')} /></label>
      {status.budget && status.policy ? <p>{t(messageKeys.catImagesBudget, { daily: status.budget.dailyUsed, dailyLimit: status.policy.dailyLimit,
        total: status.budget.totalUsed, totalLimit: status.policy.totalLimit })}</p> : null}
      <button type="button" className="companionActionButton" disabled={saving || !dirty.current || (!status.ready && !status.policy)} onClick={() => { void save(); }}>
        {t(saving ? messageKeys.catImagesSaving : messageKeys.catImagesSave)}</button>
      {status.jobs.length ? <ul>{status.jobs.slice(0, 5).map(job => <li key={job.id}>
        <span>{t(job.delivery?.abandonedAt ? job.delivery.status === 'uncertain' ? messageKeys.catImagesStoppedUnknown : messageKeys.catImagesSuppressed
          : job.delivery ? deliveryPhases[job.delivery.status] : phases[job.status])} · {job.prompt.slice(0, 80)}</span>
        {job.status === 'succeeded' ? <a href={catImageAttachmentUrl({ catId, jobId: job.id })} target="_blank" rel="noopener noreferrer"> {t(messageKeys.catImagesView)}</a> : null}
        {['submitting', 'running', 'collecting', 'interrupted'].includes(job.status) ? <button type="button" disabled={saving}
          className="companionActionButton" onClick={() => { void cancel(job.id); }}>{t(messageKeys.catImagesCancel)}</button> : null}
        {job.delivery && ['failed', 'uncertain'].includes(job.delivery.status) ? <button type="button" disabled={saving}
          className="companionActionButton" onClick={() => { void retry(job); }}>{t(messageKeys.catImagesRetry)}</button> : null}
        {job.delivery && !job.delivery.abandonedAt && ['pending', 'failed', 'uncertain'].includes(job.delivery.status) ? <button type="button" disabled={saving}
          className="companionActionButton" onClick={() => { void cancel(job.id, job.delivery?.status === 'uncertain'); }}>{t(messageKeys.catImagesStopDelivery)}</button> : null}
      </li>)}</ul> : null}
    </>}
  </section>;
}
