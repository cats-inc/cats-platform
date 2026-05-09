import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  resolvePreviewSurfaceTargetFromArtifacts,
} from '../../../../core/previewSurfaces.js';
import {
  fetchCodeArtifactDetail,
  type CodeArtifactDetailResponse,
} from '../api/codeTask.js';
import {
  buildCodeArtifactPath,
  buildCodeTaskPath,
  CODE_BUILD_PATH,
} from '../codePaths.js';

// Cross-product navigation targets. Imported as URL strings rather than as
// builder helpers because Code product code must not pull from Work / Chat
// renderer trees per the parallel delivery rules.
function buildPlatformWorkItemPath(workItemId: string): string {
  return `/work/work-items/${encodeURIComponent(workItemId)}`;
}

function buildPlatformProjectPath(projectId: string): string {
  return `/work/projects/${encodeURIComponent(projectId)}`;
}

function buildPlatformChatChannelPath(channelId: string): string {
  return `/chat/chats/${encodeURIComponent(channelId)}`;
}
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import {
  ARTIFACT_CANVAS_RENDERER_STATIC_IFRAME_PROFILE,
  IframeViewer,
} from '../../../shared/renderer/viewers/IframeViewer.js';
import {
  labelCodeArtifactKindForLocale,
  labelCodeArtifactStatusForLocale,
  labelCodeConversationKindForLocale,
  labelCodeRecordStatusForLocale,
} from './codeStatusLabels.js';

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
  const { t } = useI18n();
  const [payload, setPayload] = useState<CodeArtifactDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!artifactId) {
      setLoading(false);
      setError(t(messageKeys.codeArtifactDetailMissingId));
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchCodeArtifactDetail(artifactId, t(messageKeys.codeArtifactDetailLoadFailed))
      .then((detail) => {
        if (cancelled) {
          return;
        }
        setPayload(detail);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        setError(fetchError instanceof Error
          ? fetchError.message
          : t(messageKeys.codeArtifactDetailLoadFailed));
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
  }, [artifactId, t]);

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
            <p className="operatorEyebrow">{t(messageKeys.codeArtifactListArtifact)}</p>
            <h2>{t(messageKeys.codeArtifactDetailLoadingTitle)}</h2>
          </div>
        </div>
        <p className="operatorEmptyState">{t(messageKeys.codeArtifactDetailLoadingBody)}</p>
      </section>
    );
  }

  if (error || !payload) {
    return (
      <section className="operatorPanel codeArtifactDetailView">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">{t(messageKeys.codeArtifactListArtifact)}</p>
            <h2>{t(messageKeys.codeArtifactDetailArtifactUnavailable)}</h2>
          </div>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => navigate(CODE_BUILD_PATH)}
          >
            {t(messageKeys.codeArtifactDetailBackToBuild)}
          </button>
        </div>
        <p className="operatorEmptyState">
          {error ?? t(messageKeys.codeArtifactDetailLoadFailed)}
        </p>
      </section>
    );
  }

  const previewActionLabel = previewTarget?.renderHint === 'download'
    ? t(messageKeys.codeArtifactDetailPreviewActionOpenArtifact)
    : t(messageKeys.codeArtifactDetailPreviewActionOpenPreview);

  return (
    <div className="codeArtifactDetailView">
      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">{t(messageKeys.codeArtifactListArtifact)}</p>
            <h2>{payload.artifact.title}</h2>
          </div>
          <div className="operatorActionRow">
            <button
              type="button"
              className="operatorActionButton"
              onClick={() => navigate(CODE_BUILD_PATH)}
            >
              {t(messageKeys.codeArtifactDetailBackToBuild)}
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
            <strong>
              {payload.focus.kind === 'preview'
                ? t(messageKeys.codeArtifactDetailPreviewOutput)
                : t(messageKeys.codeArtifactDetailArtifactOutput)}
            </strong>
            <span className={artifactStatusClassName(payload.artifact.status)}>
              {labelCodeArtifactStatusForLocale(payload.artifact.status, t)}
            </span>
          </div>
          {payload.artifact.summary ? <p>{payload.artifact.summary}</p> : null}
          <div className="operatorMetaRow">
            <span>
              {t(messageKeys.codeArtifactMetaKind, {
                kind: labelCodeArtifactKindForLocale(payload.artifact.kind, t),
              })}
            </span>
            <span>{t(messageKeys.codeArtifactMetaUpdated, { updatedAt: payload.artifact.updatedAt })}</span>
            {payload.artifact.path ? <span>{payload.artifact.path}</span> : null}
          </div>
        </article>

        {previewTarget?.inlineUrl ? (
          <div className="codeBuildPreviewFrame">
            <IframeViewer
              title={payload.artifact.title}
              safeUrl={previewTarget.inlineUrl}
              iframeSandboxProfile={ARTIFACT_CANVAS_RENDERER_STATIC_IFRAME_PROFILE}
              className="codeBuildPreviewIframe"
            />
          </div>
        ) : previewTarget?.actionUrl ? (
          <div className="codeBuildPreviewFallback">
            <p className="operatorEmptyState">
              {t(messageKeys.codeArtifactDetailNotInlineSafe)}
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
            {t(messageKeys.codeArtifactDetailNoInlinePreview)}
          </p>
        )}
      </section>

      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">{t(messageKeys.codeArtifactDetailContextEyebrow)}</p>
            <h2>{t(messageKeys.codeArtifactDetailContextTitle)}</h2>
          </div>
        </div>

        <div className="operatorStack">
          {payload.task ? (
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>{t(messageKeys.codeArtifactDetailTaskLabel)}</strong>
                <span className={artifactStatusClassName(payload.task.status)}>
                  {labelCodeRecordStatusForLocale(payload.task.status, t)}
                </span>
              </div>
              <p>{payload.task.title}</p>
              <div className="operatorActionRow">
                <button
                  type="button"
                  className="operatorActionButton"
                  onClick={() => {
                    if (payload.task) {
                      navigate(buildCodeTaskPath(payload.task.id));
                    }
                  }}
                >
                  {t(messageKeys.codeArtifactDetailOpenTaskAction)}
                </button>
              </div>
            </article>
          ) : null}

          {payload.workItem ? (
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>{t(messageKeys.codeArtifactDetailWorkItemLinkedLabel)}</strong>
                <span className={artifactStatusClassName(payload.workItem.status)}>
                  {labelCodeRecordStatusForLocale(payload.workItem.status, t)}
                </span>
              </div>
              <p>{payload.workItem.title}</p>
              <div className="operatorMetaRow">
                {payload.workItem.projectTitle ? (
                  <span>
                    {t(messageKeys.codeArtifactDetailProjectMeta, {
                      projectTitle: payload.workItem.projectTitle,
                    })}
                  </span>
                ) : null}
              </div>
              <div className="operatorActionRow">
                <button
                  type="button"
                  className="operatorActionButton"
                  onClick={() => {
                    if (payload.workItem) {
                      navigate(buildPlatformWorkItemPath(payload.workItem.id));
                    }
                  }}
                >
                  {t(messageKeys.codeArtifactDetailOpenWorkItemAction)}
                </button>
              </div>
            </article>
          ) : null}

          {payload.project ? (
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>{t(messageKeys.codeArtifactDetailProjectLabel)}</strong>
                <span className={artifactStatusClassName(payload.project.status)}>
                  {labelCodeRecordStatusForLocale(payload.project.status, t)}
                </span>
              </div>
              <p>{payload.project.title}</p>
              <div className="operatorActionRow">
                <button
                  type="button"
                  className="operatorActionButton"
                  onClick={() => {
                    if (payload.project) {
                      navigate(buildPlatformProjectPath(payload.project.id));
                    }
                  }}
                >
                  {t(messageKeys.codeArtifactDetailOpenProjectAction)}
                </button>
              </div>
            </article>
          ) : null}

          {payload.conversation ? (
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>{t(messageKeys.codeArtifactDetailConversationLabel)}</strong>
                <span className="operatorStatusBadge isMuted">
                  {labelCodeConversationKindForLocale(payload.conversation.kind, t)}
                </span>
              </div>
              <p>{payload.conversation.title}</p>
              {payload.conversation.sourceChannelId ? (
                <div className="operatorActionRow">
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => {
                      if (payload.conversation?.sourceChannelId) {
                        navigate(buildPlatformChatChannelPath(
                          payload.conversation.sourceChannelId,
                        ));
                      }
                    }}
                  >
                    {t(messageKeys.codeArtifactDetailOpenConversationAction)}
                  </button>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      </section>

      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">{t(messageKeys.codeArtifactDetailRelatedEyebrow)}</p>
            <h2>{t(messageKeys.codeArtifactDetailRelatedTitle)}</h2>
          </div>
          <span className="operatorCountBadge">{payload.relatedArtifacts.length}</span>
        </div>

        {payload.relatedArtifacts.length === 0 ? (
          <p className="operatorEmptyState">
            {t(messageKeys.codeArtifactDetailRelatedEmpty)}
          </p>
        ) : (
          <div className="operatorStack">
            {payload.relatedArtifacts.map((artifact) => (
              <article key={artifact.id} className="operatorCard">
                <div className="operatorCardHeader">
                  <strong>{artifact.title}</strong>
                  <span className={artifactStatusClassName(artifact.status)}>
                    {labelCodeArtifactStatusForLocale(artifact.status, t)}
                  </span>
                </div>
                {artifact.summary ? <p>{artifact.summary}</p> : null}
                <div className="operatorMetaRow">
                  <span>{labelCodeArtifactKindForLocale(artifact.kind, t)}</span>
                  {artifact.path ? <span>{artifact.path}</span> : null}
                </div>
                <div className="operatorActionRow">
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => navigate(buildCodeArtifactPath(artifact.id))}
                  >
                    {t(messageKeys.codeArtifactDetailViewArtifact)}
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
