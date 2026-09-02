/**
 * Provider capability bootstrap, in Settings (PLAN-105 Phase 1, gate G1).
 *
 * This is the supported authoring surface for the complete bootstrap rule
 * schema. Saves are validated by the server and carry the revision Settings
 * loaded, so an out-of-band YAML edit cannot be overwritten silently. The host
 * still consumes the config at composition time, therefore a successful change
 * truthfully asks for a restart instead of pretending to hot-reload policy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  SettingsActionBar,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
} from '../../../design/components/settings/index.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';

interface CapabilityBootstrapDiagnostic {
  id: string;
  severity: string;
  code: string;
  message?: string;
}

interface CapabilityBootstrapRule {
  id: string;
  initialTreatment: 'strong_agent' | 'weak_worker';
  confidenceLevel: 'catalog_only';
  reason: string;
  selector: {
    provider: string;
    instance?: string;
    model?: string;
    control?: string;
  };
}

interface CapabilityBootstrapView {
  configPath: string;
  configPresent: boolean;
  revision: string | null;
  canInstallExample: boolean;
  parsed: boolean;
  restartRequired: boolean;
  ruleCount: number;
  rules: CapabilityBootstrapRule[];
  diagnostics: CapabilityBootstrapDiagnostic[];
}

interface CapabilityBootstrapDraftRule {
  clientKey: string;
  id: string;
  provider: string;
  instance: string;
  model: string;
  control: string;
  initialTreatment: 'strong_agent' | 'weak_worker';
  reason: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; view: CapabilityBootstrapView };

export interface CapabilityBootstrapSectionProps {
  showToast: (message: string) => void;
}

const ENDPOINT = '/api/providers/capability-bootstrap';

function toDraftRules(
  rules: CapabilityBootstrapRule[],
  nextClientKey: () => string,
): CapabilityBootstrapDraftRule[] {
  return rules.map((rule) => ({
    clientKey: nextClientKey(),
    id: rule.id,
    provider: rule.selector.provider,
    instance: rule.selector.instance ?? '',
    model: rule.selector.model ?? '',
    control: rule.selector.control ?? '',
    initialTreatment: rule.initialTreatment,
    reason: rule.reason,
  }));
}

function toConfig(rules: CapabilityBootstrapDraftRule[]) {
  return {
    version: 1 as const,
    profiles: rules.map((rule) => ({
      id: rule.id.trim(),
      selector: {
        provider: rule.provider.trim(),
        ...(rule.instance.trim() ? { instance: rule.instance.trim() } : {}),
        ...(rule.model.trim() ? { model: rule.model.trim() } : {}),
        ...(rule.control.trim() ? { control: rule.control.trim() } : {}),
      },
      initialTreatment: rule.initialTreatment,
      confidenceLevel: 'catalog_only' as const,
      reason: rule.reason.trim(),
    })),
  };
}

function viewConfig(view: CapabilityBootstrapView) {
  return {
    version: 1 as const,
    profiles: view.rules.map((rule) => ({
      id: rule.id,
      selector: rule.selector,
      initialTreatment: rule.initialTreatment,
      confidenceLevel: rule.confidenceLevel,
      reason: rule.reason,
    })),
  };
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const payload = await response.json() as { error?: { code?: unknown } };
    return typeof payload.error?.code === 'string' ? payload.error.code : null;
  } catch {
    return null;
  }
}

export function CapabilityBootstrapSection({
  showToast,
}: CapabilityBootstrapSectionProps) {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [draftRules, setDraftRules] = useState<CapabilityBootstrapDraftRule[]>([]);
  const [busy, setBusy] = useState(false);
  const clientKeyRef = useRef(0);
  const nextClientKey = useCallback(() => `capability-rule-${clientKeyRef.current++}`, []);

  const applyView = useCallback((view: CapabilityBootstrapView) => {
    setState({ status: 'ready', view });
    setDraftRules(toDraftRules(view.rules, nextClientKey));
  }, [nextClientKey]);

  const load = useCallback((signal?: AbortSignal) => {
    setState({ status: 'loading' });
    fetch(ENDPOINT, { signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((view: CapabilityBootstrapView) => {
        if (!signal?.aborted) {
          applyView(view);
        }
      })
      .catch(() => {
        if (!signal?.aborted) {
          setState({ status: 'error' });
        }
      });
  }, [applyView]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const installExample = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'install-example' }),
      });
      if (!response.ok) {
        showToast(t(messageKeys.settingsCapabilityBootstrapInstallFailed));
        return;
      }
      applyView(await response.json() as CapabilityBootstrapView);
    } catch {
      showToast(t(messageKeys.settingsCapabilityBootstrapInstallFailed));
    } finally {
      setBusy(false);
    }
  }, [applyView, showToast, t]);

  const config = useMemo(() => toConfig(draftRules), [draftRules]);
  const dirty = state.status === 'ready'
    && (!state.view.parsed || JSON.stringify(config) !== JSON.stringify(viewConfig(state.view)));

  const save = useCallback(async () => {
    if (state.status !== 'ready') {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: state.view.revision,
          config,
        }),
      });
      if (!response.ok) {
        const code = await readErrorCode(response);
        showToast(t(
          code === 'capability_bootstrap_revision_conflict'
            ? messageKeys.settingsCapabilityBootstrapRevisionConflict
            : code === 'invalid_capability_bootstrap_config'
              ? messageKeys.settingsCapabilityBootstrapValidationFailed
              : messageKeys.settingsCapabilityBootstrapSaveFailed,
        ));
        return;
      }
      applyView(await response.json() as CapabilityBootstrapView);
    } catch {
      showToast(t(messageKeys.settingsCapabilityBootstrapSaveFailed));
    } finally {
      setBusy(false);
    }
  }, [applyView, config, showToast, state, t]);

  const updateRule = useCallback((
    clientKey: string,
    patch: Partial<CapabilityBootstrapDraftRule>,
  ) => {
    setDraftRules((current) => current.map((rule) =>
      rule.clientKey === clientKey ? { ...rule, ...patch } : rule));
  }, []);

  const moveRule = useCallback((clientKey: string, offset: -1 | 1) => {
    setDraftRules((current) => {
      const index = current.findIndex((rule) => rule.clientKey === clientKey);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [rule] = next.splice(index, 1);
      next.splice(nextIndex, 0, rule!);
      return next;
    });
  }, []);

  const statusLabel = (view: CapabilityBootstrapView): string => {
    if (!view.configPresent) {
      return t(messageKeys.settingsCapabilityBootstrapStatusMissing);
    }
    return view.parsed
      ? t(messageKeys.settingsCapabilityBootstrapStatusLoaded)
      : t(messageKeys.settingsCapabilityBootstrapStatusInvalid);
  };

  return (
    <SettingsSection
      header={(
        <SettingsSectionHeader
          title={t(messageKeys.settingsCapabilityBootstrapTitle)}
          description={t(messageKeys.settingsCapabilityBootstrapDescription)}
        />
      )}
    >
      {state.status === 'loading' ? (
        <p className="settingsMutedText" role="status" aria-live="polite">
          {t(messageKeys.settingsCapabilityBootstrapLoading)}
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div className="settingsMutedText" role="alert">
          <p>{t(messageKeys.settingsCapabilityBootstrapLoadError)}</p>
          <button type="button" className="secondaryButton" onClick={() => load()}>
            {t(messageKeys.settingsCapabilityBootstrapReload)}
          </button>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <div className="capabilityBootstrap">
          <dl className="capabilityBootstrapFacts">
            <div>
              <dt>{t(messageKeys.settingsCapabilityBootstrapConfigPathLabel)}</dt>
              <dd>{state.view.configPath}</dd>
            </div>
            <div>
              <dt>{t(messageKeys.settingsCapabilityBootstrapStatusLabel)}</dt>
              <dd>
                <SettingsStatusChip
                  tone={state.view.parsed ? 'ready' : state.view.configPresent ? 'warm' : 'muted'}
                >
                  {statusLabel(state.view)}
                </SettingsStatusChip>
              </dd>
            </div>
          </dl>

          {state.view.restartRequired ? (
            <p className="settingsMutedText" role="status">
              {t(messageKeys.settingsCapabilityBootstrapRestartRequired)}
            </p>
          ) : null}

          <form
            className="capabilityBootstrapEditor"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h4 className="capabilityBootstrapSubTitle">
              {t(messageKeys.settingsCapabilityBootstrapRulesLabel)}
            </h4>

            {draftRules.length === 0 ? (
              <p className="settingsMutedText">
                {t(messageKeys.settingsCapabilityBootstrapNoRules)}
              </p>
            ) : null}

            <ol className="capabilityBootstrapRuleEditorList">
              {draftRules.map((rule, index) => (
                <li key={rule.clientKey} className="capabilityBootstrapRuleEditor">
                  <div className="capabilityBootstrapRuleEditorHeading">
                    <strong>{t(messageKeys.settingsCapabilityBootstrapRuleTitle, {
                      number: index + 1,
                    })}</strong>
                    <div className="capabilityBootstrapRuleActions">
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={busy || index === 0}
                        onClick={() => moveRule(rule.clientKey, -1)}
                      >
                        {t(messageKeys.settingsCapabilityBootstrapMoveUp)}
                      </button>
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={busy || index === draftRules.length - 1}
                        onClick={() => moveRule(rule.clientKey, 1)}
                      >
                        {t(messageKeys.settingsCapabilityBootstrapMoveDown)}
                      </button>
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={busy}
                        onClick={() => setDraftRules((current) =>
                          current.filter((candidate) => candidate.clientKey !== rule.clientKey))}
                      >
                        {t(messageKeys.settingsCapabilityBootstrapRemoveRule)}
                      </button>
                    </div>
                  </div>
                  <div className="capabilityBootstrapRuleFields">
                    <label className="fieldLabel">
                      <span>{t(messageKeys.settingsCapabilityBootstrapRuleId)}</span>
                      <input
                        className="textInput"
                        disabled={busy}
                        required
                        value={rule.id}
                        onChange={(event) => updateRule(rule.clientKey, { id: event.target.value })}
                      />
                    </label>
                    <label className="fieldLabel">
                      <span>{t(messageKeys.settingsCapabilityBootstrapProvider)}</span>
                      <input
                        className="textInput"
                        disabled={busy}
                        required
                        value={rule.provider}
                        onChange={(event) => updateRule(rule.clientKey, {
                          provider: event.target.value,
                        })}
                      />
                    </label>
                    <label className="fieldLabel">
                      <span>{t(messageKeys.settingsCapabilityBootstrapInstance)}</span>
                      <input
                        className="textInput"
                        disabled={busy}
                        value={rule.instance}
                        onChange={(event) => updateRule(rule.clientKey, {
                          instance: event.target.value,
                        })}
                      />
                    </label>
                    <label className="fieldLabel">
                      <span>{t(messageKeys.settingsCapabilityBootstrapModel)}</span>
                      <input
                        className="textInput"
                        disabled={busy}
                        value={rule.model}
                        onChange={(event) => updateRule(rule.clientKey, {
                          model: event.target.value,
                        })}
                      />
                    </label>
                    <label className="fieldLabel">
                      <span>{t(messageKeys.settingsCapabilityBootstrapControl)}</span>
                      <input
                        className="textInput"
                        disabled={busy}
                        value={rule.control}
                        onChange={(event) => updateRule(rule.clientKey, {
                          control: event.target.value,
                        })}
                      />
                    </label>
                    <label className="fieldLabel">
                      <span>{t(messageKeys.settingsCapabilityBootstrapTreatment)}</span>
                      <select
                        className="textInput"
                        disabled={busy}
                        value={rule.initialTreatment}
                        onChange={(event) => updateRule(rule.clientKey, {
                          initialTreatment: event.target.value as
                            CapabilityBootstrapDraftRule['initialTreatment'],
                        })}
                      >
                        <option value="strong_agent">
                          {t(messageKeys.settingsCapabilityBootstrapTreatmentStrong)}
                        </option>
                        <option value="weak_worker">
                          {t(messageKeys.settingsCapabilityBootstrapTreatmentWeak)}
                        </option>
                      </select>
                    </label>
                    <label className="fieldLabel capabilityBootstrapReasonField">
                      <span>{t(messageKeys.settingsCapabilityBootstrapReason)}</span>
                      <textarea
                        className="textInput"
                        disabled={busy}
                        required
                        value={rule.reason}
                        onChange={(event) => updateRule(rule.clientKey, {
                          reason: event.target.value,
                        })}
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ol>

            <SettingsActionBar>
              <button
                type="button"
                className="secondaryButton"
                disabled={busy}
                onClick={() => setDraftRules((current) => [
                  ...current,
                  {
                    clientKey: nextClientKey(),
                    id: '',
                    provider: '',
                    instance: '',
                    model: '',
                    control: '',
                    initialTreatment: 'weak_worker',
                    reason: '',
                  },
                ])}
              >
                {t(messageKeys.settingsCapabilityBootstrapAddRule)}
              </button>
              <button type="submit" className="primaryButton" disabled={busy || !dirty}>
                {busy
                  ? t(messageKeys.sharedCommonSaving)
                  : t(messageKeys.settingsCapabilityBootstrapSave)}
              </button>
              <button
                type="button"
                className="secondaryButton"
                disabled={busy}
                onClick={() => load()}
              >
                {t(messageKeys.settingsCapabilityBootstrapReload)}
              </button>
            </SettingsActionBar>
          </form>

          {state.view.diagnostics.length > 0 ? (
            <>
              <h4 className="capabilityBootstrapSubTitle">
                {t(messageKeys.settingsCapabilityBootstrapDiagnosticsLabel)}
              </h4>
              <ul className="capabilityBootstrapDiagnostics">
                {state.view.diagnostics.map((diagnostic) => (
                  <li key={diagnostic.id} data-severity={diagnostic.severity}>
                    <span className="capabilityBootstrapRuleId">{diagnostic.code}</span>
                    {diagnostic.message ? <span>{diagnostic.message}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {state.view.canInstallExample ? (
            <button
              type="button"
              className="secondaryButton"
              disabled={busy}
              onClick={() => void installExample()}
            >
              {t(messageKeys.settingsCapabilityBootstrapInstallExample)}
            </button>
          ) : null}

          <p className="settingsMutedText">
            {t(messageKeys.settingsCapabilityBootstrapEditHint)}
          </p>
        </div>
      ) : null}
    </SettingsSection>
  );
}
