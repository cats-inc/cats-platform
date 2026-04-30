import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import type { CodeWorkspaceSummary } from '../../shared/workspaceSummary.js';
import {
  describeCodeWorkspaceBindingForLocale,
  labelCodeWorkspaceKindForLocale,
  labelCodeWorkspaceOwnershipStateForLocale,
} from './codeWorkspaceLabels.js';

export interface CodeWorkspaceSummaryPanelProps {
  summary: CodeWorkspaceSummary;
  selectedChannelTitle?: string | null;
}

export function CodeWorkspaceSummaryPanel({
  summary,
  selectedChannelTitle,
}: CodeWorkspaceSummaryPanelProps) {
  const { t } = useI18n();
  const workspaceKindLabel = labelCodeWorkspaceKindForLocale(summary.workspaceKind, t);
  const ownershipStateLabel = labelCodeWorkspaceOwnershipStateForLocale(
    summary.ownershipState,
    t,
  );

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">{t(messageKeys.codeWorkspaceSummaryCodespace)}</p>
          <h2>{t(messageKeys.codeWorkspaceSummaryBinding)}</h2>
        </div>
        <span className="operatorStatusBadge isMuted">
          {workspaceKindLabel}
        </span>
      </div>

      <article className="operatorCard codeWorkspaceSummaryCard">
        <div className="operatorCardHeader">
          <strong>{summary.workspacePath}</strong>
          <span className="operatorStatusBadge isMuted">
            {ownershipStateLabel}
          </span>
        </div>
        <p>{describeCodeWorkspaceBindingForLocale(summary, t)}</p>
        <div className="operatorMetaRow">
          <span>
            {t(messageKeys.codeWorkspaceSummaryKind, { kind: workspaceKindLabel })}
          </span>
          <span>
            {t(messageKeys.codeWorkspaceSummaryOwnership, { ownership: ownershipStateLabel })}
          </span>
          {selectedChannelTitle && summary.workspaceKind !== 'user_selected' ? (
            <span>
              {t(messageKeys.codeWorkspaceSummaryNoticeConversation, {
                title: selectedChannelTitle,
              })}
            </span>
          ) : null}
        </div>
      </article>
    </section>
  );
}
