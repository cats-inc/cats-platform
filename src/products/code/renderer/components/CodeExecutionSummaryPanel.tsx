export interface CodeExecutionSummaryPanelProps {
  taskId: string | null;
  taskStatus: string | null;
  effectiveStrategy: string | null;
  sessionId: string | null;
  sessionStatus: string | null;
  provider: string | null;
  model: string | null;
}

function statusBadgeClass(status: string | null): string {
  switch (status) {
    case 'completed':
    case 'closed':
    case 'ready':
      return 'operatorStatusBadge isSuccess';
    case 'in_progress':
    case 'running':
      return 'operatorStatusBadge isAttention';
    case 'blocked':
    case 'failed':
    case 'error':
      return 'operatorStatusBadge isError';
    default:
      return 'operatorStatusBadge isMuted';
  }
}

export function CodeExecutionSummaryPanel({
  taskId,
  taskStatus,
  effectiveStrategy,
  sessionId,
  sessionStatus,
  provider,
  model,
}: CodeExecutionSummaryPanelProps) {
  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Execution</p>
          <h2>Task Run</h2>
        </div>
      </div>

      <div className="operatorStack">
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>Task</strong>
            <span className={statusBadgeClass(taskStatus)}>
              {taskStatus ?? 'not started'}
            </span>
          </div>
          <div className="operatorMetaRow">
            {taskId ? <span>ID: {taskId}</span> : <span>No task bound yet</span>}
            {effectiveStrategy ? <span>Strategy: {effectiveStrategy}</span> : null}
          </div>
        </article>

        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>Runtime</strong>
            <span className={statusBadgeClass(sessionStatus)}>
              {sessionStatus ?? 'idle'}
            </span>
          </div>
          <div className="operatorMetaRow">
            {provider ? <span>Provider: {provider}</span> : null}
            <span>Model: {model?.trim() ? model : 'default'}</span>
            {sessionId ? <span>Session: {sessionId}</span> : <span>No active session</span>}
          </div>
        </article>
      </div>
    </section>
  );
}
