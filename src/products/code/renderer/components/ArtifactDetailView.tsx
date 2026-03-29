import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  resolvePreviewSurfaceTargetFromArtifacts,
} from '../../../../core/previewSurfaces.js';
import { fetchCodeArtifactDetail } from '../api/codeTask.js';
import type { ArtifactItem } from './BuildPreviewPanel.js';

interface ArtifactSummary {
  id: string;
  title: string;
  kind: string;
  status: string;
  summary: string | null;
  path: string | null;
  updatedAt: string;
}

interface ArtifactDetailPayload {
  artifact: ArtifactSummary;
  task: {
    id: string;
    title: string;
    status: string;
  } | null;
  workItem: {
    id: string;
    title: string;
    status: string;
    projectTitle: string | null;
  } | null;
  project: {
    id: string;
    title: string;
    status: string;
  } | null;
  conversation: {
    id: string;
    title: string;
    kind: string;
  } | null;
  relatedArtifacts: ArtifactItem[];
  focus: {
    kind: string;
    isReady: boolean;
    isPublished: boolean;
  };
}

function artifactStatusClassName(status: string): string {
  switch (status) {
    case 'ready':
      return 'operatorStatusBadge isSuccess';
    case 'published':
      return 'operatorStatusBadge codeBuilderStatusBadgePublished';
    case 'draft':
      return 'operatorStatusBadge isMuted';
    default:
      return 'operatorStatusBadge isAttention';
  }
}

export function ArtifactDetailView() {
  const navigate = useNavigate();
  const { artifactId } = useParams<{ artifactId: string }>();
  const [payload, setPayload] = useState<ArtifactDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!artifactId) {
      setLoading(false);
      setError('Artifact id is required.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchCodeArtifactDetail(artifactId)
      .then((detail) => {
        if (cancelled) {
          return;
        }
        setPayload(detail as ArtifactDetailPayload);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load artifact detail.');
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  const previewTarget = useMemo(() => {
    if (!payload) {
      return null;
    }

    return resolvePreviewSurfaceTargetFromArtifacts([
      {
        id: payload.artifact.id,
        title: payload.artifact.title,
        kind: payload.artifact.kind,
        path: payload.artifact.path,
      },
    ]);
  }, [payload]);

  if (loading) {
    return (
      <section className="operatorPanel codeArtifactDetailView">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">Artifact</p>
            <h2>Loading artifact detail</h2>
          </div>
        </div>
        <p className="operatorEmptyState">Fetching artifact metadata and related context.</p>
      </section>
    );
  }

  if (error || !payload) {
    return (
      <section className="operatorPanel codeArtifactDetailView">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">Artifact</p>
            <h2>Artifact detail unavailable</h2>
          </div>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => navigate('/code/build')}
          >
            Back to Build
          </button>
        </div>
        <p className="operatorEmptyState">{error ?? 'Artifact detail could not be loaded.'}</p>
      </section>
    );
  }

  const previewActionLabel = previewTarget?.renderHint === 'download'
    ? 'Open artifact'
    : 'Open preview';

  return (
    <div className="codeArtifactDetailView">
      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">Artifact</p>
            <h2>{payload.artifact.title}</h2>
          </div>
          <div className="operatorActionRow">
            <button
              type="button"
              className="operatorActionButton"
              onClick={() => navigate('/code/build')}
            >
              Back to Build
            </button>
            {previewTarget?.actionUrl ? (
              <a
                className="operatorActionButton"
                href={previewTarget.actionUrl}
                rel="noreferrer"
                target="_blank"
              >
                {previewActionLabel}
              </a>
            ) : null}
          </div>
        </div>

        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{payload.focus.kind === 'preview' ? 'Preview output' : 'Artifact output'}</strong>
            <span className={artifactStatusClassName(payload.artifact.status)}>
              {payload.artifact.status}
            </span>
          </div>
          {payload.artifact.summary ? <p>{payload.artifact.summary}</p> : null}
          <div className="operatorMetaRow">
            <span>Kind: {payload.artifact.kind}</span>
            <span>Updated: {payload.artifact.updatedAt}</span>
            {payload.artifact.path ? <span>{payload.artifact.path}</span> : null}
          </div>
        </article>

        {previewTarget?.inlineUrl ? (
          <div className="codeBuildPreviewFrame">
            <iframe
              src={previewTarget.inlineUrl}
              title={payload.artifact.title}
              sandbox="allow-scripts allow-same-origin"
              className="codeBuildPreviewIframe"
            />
          </div>
        ) : previewTarget?.actionUrl ? (
          <div className="codeBuildPreviewFallback">
            <p className="operatorEmptyState">
              This artifact is available, but it is not inline-safe in the current Code surface.
            </p>
            <a
              className="operatorActionButton"
              href={previewTarget.actionUrl}
              rel="noreferrer"
              target="_blank"
            >
              {previewActionLabel}
            </a>
          </div>
        ) : (
          <p className="operatorEmptyState">
            No inline preview is available for this artifact yet.
          </p>
        )}
      </section>

      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">Context</p>
            <h2>Linked Records</h2>
          </div>
        </div>

        <div className="operatorStack">
          {payload.task ? (
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>Task</strong>
                <span className={artifactStatusClassName(payload.task.status)}>{payload.task.status}</span>
              </div>
              <p>{payload.task.title}</p>
            </article>
          ) : null}

          {payload.workItem ? (
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>Work Item</strong>
                <span className={artifactStatusClassName(payload.workItem.status)}>
                  {payload.workItem.status}
                </span>
              </div>
              <p>{payload.workItem.title}</p>
              <div className="operatorMetaRow">
                {payload.workItem.projectTitle ? <span>Project: {payload.workItem.projectTitle}</span> : null}
              </div>
            </article>
          ) : null}

          {payload.project ? (
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>Project</strong>
                <span className={artifactStatusClassName(payload.project.status)}>{payload.project.status}</span>
              </div>
              <p>{payload.project.title}</p>
            </article>
          ) : null}

          {payload.conversation ? (
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>Conversation</strong>
                <span className="operatorStatusBadge isMuted">{payload.conversation.kind}</span>
              </div>
              <p>{payload.conversation.title}</p>
            </article>
          ) : null}
        </div>
      </section>

      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">Related</p>
            <h2>Neighboring Artifacts</h2>
          </div>
          <span className="operatorCountBadge">{payload.relatedArtifacts.length}</span>
        </div>

        {payload.relatedArtifacts.length === 0 ? (
          <p className="operatorEmptyState">
            No related artifacts were recorded for this task or work item.
          </p>
        ) : (
          <div className="operatorStack">
            {payload.relatedArtifacts.map((artifact) => (
              <article key={artifact.id} className="operatorCard">
                <div className="operatorCardHeader">
                  <strong>{artifact.title}</strong>
                  <span className={artifactStatusClassName(artifact.status)}>{artifact.status}</span>
                </div>
                {artifact.summary ? <p>{artifact.summary}</p> : null}
                <div className="operatorMetaRow">
                  <span>{artifact.kind}</span>
                  {artifact.path ? <span>{artifact.path}</span> : null}
                </div>
                <div className="operatorActionRow">
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => navigate(`/code/artifacts/${artifact.id}`)}
                  >
                    View artifact
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
