import { useEffect, useState } from 'react';

import type { CodeDashboardProjection } from '../api/projection';

import { fetchCodeDashboard } from './api';
import './code.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: CodeDashboardProjection }
  | { status: 'error'; message: string };

function formatLabel(value: string | null | undefined): string {
  if (!value) {
    return 'none';
  }

  return value
    .replace(/_/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'No recent update';
  }

  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CodeApp() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void fetchCodeDashboard()
      .then((payload) => {
        if (!cancelled) {
          setState({ status: 'ready', payload });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load Cats Code.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="codeSurface">
        <section className="codeHeroCard">
          <p className="codeEyebrow">Cats Code</p>
          <h1>Loading code dashboard...</h1>
        </section>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="codeSurface">
        <section className="codeHeroCard">
          <p className="codeEyebrow">Cats Code</p>
          <h1>Could not load Code</h1>
          <p className="codeEmptyState">{state.message}</p>
        </section>
      </div>
    );
  }

  const { payload } = state;

  return (
    <div className="codeSurface">
      <section className="codeHeroCard">
        <div className="codeHeroCopy">
          <p className="codeEyebrow">Cats Code</p>
          <h1>Code-oriented tasks and artifact output</h1>
          <p>
            Code now reads the shared task substrate and artifact ledger directly.
            This first slice focuses on code-targeted execution intent plus the
            build and preview outputs that eventually feed richer code workspaces.
          </p>
        </div>
        <div className="codeSummaryGrid">
          <div className="codeSummaryCard">
            <span className="codeSummaryValue">{payload.summary.taskCount}</span>
            <span className="codeSummaryLabel">Code Tasks</span>
          </div>
          <div className="codeSummaryCard">
            <span className="codeSummaryValue">{payload.summary.artifactCount}</span>
            <span className="codeSummaryLabel">Artifacts</span>
          </div>
          <div className="codeSummaryCard">
            <span className="codeSummaryValue">{payload.summary.buildCount}</span>
            <span className="codeSummaryLabel">Builds</span>
          </div>
          <div className="codeSummaryCard">
            <span className="codeSummaryValue">{payload.summary.previewCount}</span>
            <span className="codeSummaryLabel">Previews</span>
          </div>
        </div>
      </section>

      <div className="codeLayout">
        <section className="codeSectionCard">
          <div className="codeSectionHeader">
            <div>
              <p className="codeSectionEyebrow">{payload.sections.tasks.title}</p>
              <h2>{payload.sections.tasks.summary.returned} visible tasks</h2>
            </div>
          </div>
          {payload.sections.tasks.items.length === 0 ? (
            <p className="codeEmptyState">{payload.sections.tasks.emptyState}</p>
          ) : (
            <div className="codeCardList">
              {payload.sections.tasks.items.map((task) => (
                <article className="codeCard" key={task.id}>
                  <div className="codeCardHeader">
                    <strong>{task.title}</strong>
                    <span className="codeBadge">{formatLabel(task.status)}</span>
                  </div>
                  <p className="codeCardMeta">
                    {task.conversationTitle ?? 'No linked conversation'}
                    {' · '}
                    {formatTimestamp(task.updatedAt)}
                  </p>
                  <p className="codeCardCopy">{task.summary ?? 'No task summary recorded yet.'}</p>
                  <div className="codeChipRow">
                    <span className="codeChip">
                      Strategy: {task.effectiveStrategy ?? 'not resolved'}
                    </span>
                    <span className="codeChip">
                      {task.workItemTitle ?? 'No linked work item'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="codeSectionCard">
          <div className="codeSectionHeader">
            <div>
              <p className="codeSectionEyebrow">{payload.sections.artifacts.title}</p>
              <h2>{payload.sections.artifacts.summary.returned} visible artifacts</h2>
            </div>
          </div>
          {payload.sections.artifacts.items.length === 0 ? (
            <p className="codeEmptyState">{payload.sections.artifacts.emptyState}</p>
          ) : (
            <div className="codeCardList">
              {payload.sections.artifacts.items.map((artifact) => (
                <article className="codeCard" key={artifact.id}>
                  <div className="codeCardHeader">
                    <strong>{artifact.title}</strong>
                    <span className="codeBadge codeBadgeAccent">
                      {formatLabel(artifact.kind)}
                    </span>
                  </div>
                  <p className="codeCardMeta">
                    {formatLabel(artifact.status)}
                    {' · '}
                    {formatTimestamp(artifact.updatedAt)}
                  </p>
                  <p className="codeCardCopy">{artifact.summary ?? artifact.path ?? 'No artifact summary recorded yet.'}</p>
                  <div className="codeChipRow">
                    <span className="codeChip">
                      {artifact.taskTitle ?? 'No linked task'}
                    </span>
                    <span className="codeChip">
                      {artifact.workItemTitle ?? 'No linked work item'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
