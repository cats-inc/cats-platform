/**
 * Desktop's delegation-readiness surface (SPEC-114 FR-3, PLAN-105 gate G1).
 *
 * Telegram already answers "why was my `/work` refused?" in the chat. That is
 * the wrong place to *fix* it: the prerequisites live in Desktop settings. This
 * panel shows the same evaluation — served by the same evaluator, never a second
 * copy of the rules — next to the pages that resolve each blocker.
 *
 * Every blocker is rendered with its localized reason and a link to the page
 * that fixes it, so setup stops being a guessing game where each fix reveals the
 * next missing piece.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import {
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
} from '../../../../../design/components/settings/index.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import {
  DELIVERY_MODE_KEYS,
  READINESS_REASON_KEYS,
} from '../../../shared/workGoldenPathMessages.js';
import {
  fetchWorkDeliveryReadiness,
  type WorkDeliveryReadinessReport,
} from '../../api/deliveryReadiness.js';

import './deliveryReadiness.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; report: WorkDeliveryReadinessReport };

export function DeliveryReadinessSection() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback((signal?: AbortSignal) => {
    setState({ status: 'loading' });
    fetchWorkDeliveryReadiness(t(messageKeys.workDeliveryReadinessSectionLoadError), signal)
      .then((report) => {
        if (signal?.aborted) {
          return;
        }
        setState({ status: 'ready', report });
      })
      .catch(() => {
        if (signal?.aborted) {
          return;
        }
        setState({ status: 'error' });
      });
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <SettingsSection
      header={(
        <SettingsSectionHeader
          title={t(messageKeys.workDeliveryReadinessSectionTitle)}
          description={t(messageKeys.workDeliveryReadinessSectionDescription)}
        />
      )}
    >
      {state.status === 'loading' ? (
        <p className="settingsMutedText" role="status" aria-live="polite">
          {t(messageKeys.workDeliveryReadinessSectionLoading)}
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div className="settingsMutedText" role="alert">
          <p>{t(messageKeys.workDeliveryReadinessSectionLoadError)}</p>
          <button type="button" className="secondaryButton" onClick={() => load()}>
            {t(messageKeys.workDeliveryReadinessRefresh)}
          </button>
        </div>
      ) : null}

      {state.status === 'ready' && !state.report.enabled ? (
        <p className="settingsMutedText">
          {t(messageKeys.workDeliveryReadinessSectionDisabled)}
        </p>
      ) : null}

      {state.status === 'ready' && state.report.enabled ? (
        <div className="workDeliveryReadiness">
          <dl className="workDeliveryReadinessFacts">
            <div>
              <dt>{t(messageKeys.workDeliveryReadinessWorkspaceLabel)}</dt>
              <dd>
                {state.report.workspacePath
                  ?? t(messageKeys.workDeliveryReadinessWorkspaceUnset)}
              </dd>
            </div>
            <div>
              <dt>{t(messageKeys.workDeliveryReadinessAuthorizedOwnersLabel)}</dt>
              <dd>{state.report.authorizedOwnerCount}</dd>
            </div>
          </dl>

          {state.report.bindings.length === 0 ? (
            <p className="settingsMutedText">
              {t(messageKeys.workDeliveryReadinessSectionNoBindings)}
            </p>
          ) : null}

          <ul className="workDeliveryReadinessBindings">
            {state.report.bindings.map((binding) => (
              <li key={binding.bindingId} className="workDeliveryReadinessBinding">
                <div className="workDeliveryReadinessBindingHeader">
                  <span className="workDeliveryReadinessBindingName">
                    {binding.botName ?? binding.bindingId}
                  </span>
                  <SettingsStatusChip tone={binding.readiness.ready ? 'ready' : 'warm'}>
                    {binding.readiness.ready
                      ? t(messageKeys.workDeliveryReadinessStatusReady)
                      : t(messageKeys.workDeliveryReadinessStatusBlocked)}
                  </SettingsStatusChip>
                </div>

                <dl className="workDeliveryReadinessFacts">
                  <div>
                    <dt>{t(messageKeys.workDeliveryReadinessDeliveryModeLabel)}</dt>
                    <dd>{t(DELIVERY_MODE_KEYS[binding.deliveryMode])}</dd>
                  </div>
                  <div>
                    <dt>{t(messageKeys.workDeliveryReadinessToolScopeLabel)}</dt>
                    <dd>{binding.toolScope}</dd>
                  </div>
                </dl>

                {binding.readiness.blockers.length > 0 ? (
                  <>
                    <h4 className="workDeliveryReadinessBlockersTitle">
                      {t(messageKeys.workDeliveryReadinessBlockersLabel)}
                    </h4>
                    <ul className="workDeliveryReadinessBlockers">
                      {binding.readiness.blockers.map((blocker) => (
                        <li key={blocker.reason}>
                          <span>{t(READINESS_REASON_KEYS[blocker.reason])}</span>
                          {blocker.remediationPath ? (
                            <button
                              type="button"
                              className="linkButton"
                              onClick={() => navigate(blocker.remediationPath as string)}
                            >
                              {t(messageKeys.workDeliveryReadinessOpenRemediation)}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </li>
            ))}
          </ul>

          <button type="button" className="secondaryButton" onClick={() => load()}>
            {t(messageKeys.workDeliveryReadinessRefresh)}
          </button>
        </div>
      ) : null}
    </SettingsSection>
  );
}
