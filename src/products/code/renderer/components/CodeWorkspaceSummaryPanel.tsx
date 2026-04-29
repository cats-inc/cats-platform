import {
  labelCodeWorkspaceKind,
  labelCodeWorkspaceOwnershipState,
  type CodeWorkspaceSummary,
} from '../../shared/workspaceSummary.js';

export interface CodeWorkspaceSummaryPanelProps {
  summary: CodeWorkspaceSummary;
  selectedChannelTitle?: string | null;
}

function describeWorkspaceBinding(summary: CodeWorkspaceSummary): string {
  switch (summary.workspaceKind) {
    case 'conversation_repo':
      return 'Builder loop is bound to the selected chat repo.';
    case 'managed_room':
      return 'Builder loop is bound to the selected room-managed codespace.';
    default:
      return 'Builder loop is bound to the owner-selected local folder.';
  }
}

export function CodeWorkspaceSummaryPanel({
  summary,
  selectedChannelTitle,
}: CodeWorkspaceSummaryPanelProps) {
  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Codespace</p>
          <h2>Binding</h2>
        </div>
        <span className="operatorStatusBadge isMuted">
          {labelCodeWorkspaceKind(summary.workspaceKind)}
        </span>
      </div>

      <article className="operatorCard codeWorkspaceSummaryCard">
        <div className="operatorCardHeader">
          <strong>{summary.workspacePath}</strong>
          <span className="operatorStatusBadge isMuted">
            {labelCodeWorkspaceOwnershipState(summary.ownershipState)}
          </span>
        </div>
        <p>{describeWorkspaceBinding(summary)}</p>
        <div className="operatorMetaRow">
          <span>Kind: {labelCodeWorkspaceKind(summary.workspaceKind)}</span>
          <span>Ownership: {labelCodeWorkspaceOwnershipState(summary.ownershipState)}</span>
          {selectedChannelTitle && summary.workspaceKind !== 'user_selected' ? (
            <span>Chat context: {selectedChannelTitle}</span>
          ) : null}
        </div>
      </article>
    </section>
  );
}
