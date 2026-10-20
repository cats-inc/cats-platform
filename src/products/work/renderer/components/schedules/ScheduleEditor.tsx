import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { createWorkSchedule, updateWorkSchedule, type WorkScheduleRule, type WorkScheduleCreateInput } from '../../api/schedules.js';
import { getScheduleConcurrencyPolicyLabel, getScheduleMisfirePolicyLabel, getScheduleRetryBackoffLabel } from './scheduleUiSupport.js';

interface TargetActor { id: string; name: string; status: string; source: string; sourceId: string | null; defaultExecutionTarget: unknown }
function localDateTime(iso?: string) { const date = iso ? new Date(iso) : new Date(Date.now() + 3600000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); }

export function ScheduleEditor({ rule, duplicate = false, onClose }: { rule?: WorkScheduleRule; duplicate?: boolean; onClose: () => void }) {
  const { t } = useI18n(); const client = useQueryClient();
  const [title, setTitle] = useState(rule?.title ?? ''), [enabled, setEnabled] = useState(duplicate ? false : rule?.enabled ?? false);
  const [timezone, setTimezone] = useState(rule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [kind, setKind] = useState<'once' | 'daily'>(rule?.schedule.kind ?? 'daily');
  const [time, setTime] = useState(rule?.schedule.kind === 'daily' ? rule.schedule.time : '09:00');
  const [fireAt, setFireAt] = useState(localDateTime(rule?.schedule.kind === 'once' ? rule.schedule.fireAt : undefined));
  const initialTarget = rule?.missionTemplate.target;
  const [target, setTarget] = useState(initialTarget?.kind === 'cat' ? `actor-cat-${initialTarget.id}` : initialTarget?.id ?? '');
  const [intent, setIntent] = useState(rule?.missionTemplate.intent ?? '');
  const [concurrency, setConcurrency] = useState(rule?.executionPolicy.concurrencyPolicy ?? 'skip');
  const [misfire, setMisfire] = useState(rule?.executionPolicy.misfirePolicy ?? 'skip');
  const [attempts, setAttempts] = useState(rule?.executionPolicy.retryPolicy.maxAttempts ?? 0);
  const [backoff, setBackoff] = useState(rule?.executionPolicy.retryPolicy.backoff ?? 'none');
  const [pauseAfter, setPauseAfter] = useState(rule?.executionPolicy.retryPolicy.pauseAfterConsecutiveFailures?.toString() ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const actors = useQuery<TargetActor[]>({ queryKey: ['schedule-targets'], queryFn: async () => { const response = await fetch('/api/core/actors'); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? t('ownerActionFailed')); return body.actors.filter((actor: TargetActor) => actor.status === 'active' && !!actor.defaultExecutionTarget); } });
  async function save() {
    setBusy(true); setError('');
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
      const actor = actors.data?.find(actor => actor.id === target);
      if (!actor) throw new Error(t('ownerScheduleChooseTarget'));
      const input: WorkScheduleCreateInput = { title, enabled, timezone, schedule: kind === 'daily' ? { kind, time } : { kind, fireAt: rule?.schedule.kind === 'once' && fireAt === localDateTime(rule.schedule.fireAt) ? rule.schedule.fireAt : new Date(fireAt).toISOString() },
        missionTemplate: { ...rule?.missionTemplate, target: actor.source === 'chat_cat' && actor.sourceId ? { kind: 'cat', id: actor.sourceId } : { kind: 'agent', id: actor.id }, originSurface: 'schedule', intent },
        executionPolicy: { ...rule?.executionPolicy, missionPolicy: 'per_fire', concurrencyPolicy: concurrency, misfirePolicy: misfire, retryPolicy: { maxAttempts: attempts, backoff, pauseAfterConsecutiveFailures: pauseAfter ? Number(pauseAfter) : null } } };
      if (rule && !duplicate) await updateWorkSchedule(rule.id, { ...input, expectedRule: rule }); else await createWorkSchedule(input);
      await client.invalidateQueries(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); }
    finally { setBusy(false); }
  }
  return <section className="ownerRecordActions" aria-label={t('ownerScheduleEditor')}><h2>{t('ownerScheduleEditor')}</h2><form onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy}>
    <label>{t('ownerTitle')} <input autoFocus required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />{t('workScheduleEnabledStatus')}</label>
    <label>{t('workScheduleScheduleLabel')} <select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="daily">{t('ownerScheduleDaily')}</option><option value="once">{t('ownerScheduleOnce')}</option></select></label>
    <label>{t('workScheduleTimezoneLabel')} <input required value={timezone} onChange={event => setTimezone(event.target.value)} /></label>
    {kind === 'daily' ? <label>{t('ownerScheduleTime')} <input type="time" required value={time} onChange={event => setTime(event.target.value)} /></label> : <label>{t('ownerScheduleOnceLocal')} <input type="datetime-local" required value={fireAt} onChange={event => setFireAt(event.target.value)} /></label>}
    <label>{t('workScheduleTargetLabel')} <select required value={target} onChange={event => setTarget(event.target.value)}><option value="">{t('ownerScheduleChooseTarget')}</option>{actors.data?.map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
    <label>{t('ownerScheduleIntent')} <textarea required value={intent} onChange={event => setIntent(event.target.value)} /></label>
    <label>{t('workScheduleConcurrencyLabel')} <select value={concurrency} onChange={event => setConcurrency(event.target.value as typeof concurrency)}>{(['skip', 'queue', 'replace'] as const).map(value => <option key={value} value={value}>{getScheduleConcurrencyPolicyLabel(value, t)}</option>)}</select></label>
    <label>{t('workScheduleMisfireLabel')} <select value={misfire} onChange={event => setMisfire(event.target.value as typeof misfire)}>{(['skip', 'fire_once', 'fire_all'] as const).map(value => <option key={value} value={value}>{getScheduleMisfirePolicyLabel(value, t)}</option>)}</select></label>
    <label>{t('ownerScheduleRetries')} <input type="number" min={0} max={20} value={attempts} onChange={event => setAttempts(Number(event.target.value))} /></label>
    <label>{t('ownerScheduleBackoff')} <select value={backoff} onChange={event => setBackoff(event.target.value as typeof backoff)}>{(['none', 'fixed', 'exponential'] as const).map(value => <option key={value} value={value}>{getScheduleRetryBackoffLabel(value, t)}</option>)}</select></label>
    <label>{t('ownerSchedulePauseAfter')} <input type="number" min={1} value={pauseAfter} onChange={event => setPauseAfter(event.target.value)} /></label>
    <p>{t('ownerSchedulePoliciesPreserved')}</p>{actors.isError ? <p role="alert">{actors.error.message}</p> : null}
    <button disabled={actors.isPending || actors.isError}>{t('ownerApply')}</button><button type="button" onClick={onClose}>{t('ownerCancel')}</button>
  </fieldset>{error ? <p role="alert">{error}</p> : null}</form></section>;
}
