/**
 * Provider capability bootstrap, in Settings (PLAN-105 Phase 1, gate G1).
 *
 * Until now the only way to see or create this config was to find the YAML path
 * in a diagnostic and edit the file by hand — and those diagnostics were
 * collected into a sink that no surface rendered, so a malformed file failed
 * silently.
 *
 * This panel shows where the file is looked for, whether it parsed, what rules
 * are in effect, and every diagnostic; and it can install the bundled example
 * once. Rule authoring stays in the file, where each rule is documented in
 * place. A newly installed file needs a restart, which the panel says outright
 * rather than implying a reload that the host cannot perform.
 */

import { useCallback, useEffect, useState } from 'react';

import {
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

interface CapabilityBootstrapView {
  configPath: string;
  configPresent: boolean;
  canInstallExample: boolean;
  parsed: boolean;
  restartRequired: boolean;
  ruleCount: number;
  rules: Array<{ id: string; initialTreatment: string; reason: string }>;
  diagnostics: CapabilityBootstrapDiagnostic[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; view: CapabilityBootstrapView };

const ENDPOINT = '/api/providers/capability-bootstrap';

export function CapabilityBootstrapSection() {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [installError, setInstallError] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    setState({ status: 'loading' });
    fetch(ENDPOINT, { signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((view: CapabilityBootstrapView) => {
        if (!signal?.aborted) {
          setState({ status: 'ready', view });
        }
      })
      .catch(() => {
        if (!signal?.aborted) {
          setState({ status: 'error' });
        }
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const installExample = useCallback(async () => {
    setInstallError(false);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'install-example' }),
      });
      if (!response.ok) {
        setInstallError(true);
        return;
      }
      setState({ status: 'ready', view: await response.json() });
    } catch {
      setInstallError(true);
    }
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
        <p className="settingsMutedText" role="alert">
          {t(messageKeys.settingsCapabilityBootstrapLoadError)}
        </p>
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

          {state.view.rules.length > 0 ? (
            <>
              <h4 className="capabilityBootstrapSubTitle">
                {t(messageKeys.settingsCapabilityBootstrapRulesLabel)}
              </h4>
              <ul className="capabilityBootstrapRules">
                {state.view.rules.map((rule) => (
                  <li key={rule.id}>
                    <span className="capabilityBootstrapRuleId">{rule.id}</span>
                    <span>{rule.initialTreatment}</span>
                    <span className="settingsMutedText">{rule.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

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

          {installError ? (
            <p className="settingsMutedText" role="alert">
              {t(messageKeys.settingsCapabilityBootstrapInstallFailed)}
            </p>
          ) : null}

          {state.view.canInstallExample ? (
            <button
              type="button"
              className="secondaryButton"
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
