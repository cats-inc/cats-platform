import { useEffect, useState, type ReactNode } from 'react';

import type { ChatCat } from '../../../api/contracts.js';
import type { CompanionProfileReadModel } from '../../../companion/profileReadModel.js';
import type {
  CompanionActivityProjection,
  CompanionActivityRenderEntry,
} from '../../../companion/activityProjection.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

type FeedTab = 'posts' | 'photos' | 'videos' | 'music' | 'files' | 'activity';
type CompanionFeedSurface = 'photo' | 'video' | 'music' | 'file';
type TranslateFn = (key: keyof typeof messageKeys, values?: Record<string, unknown>) => string;

const FEED_TABS: ReadonlyArray<{ id: FeedTab; labelKey: keyof typeof messageKeys }> = [
  { id: 'posts', labelKey: 'chatCompanionFeedTabPosts' },
  { id: 'photos', labelKey: 'chatCompanionFeedTabPhotos' },
  { id: 'videos', labelKey: 'chatCompanionFeedTabVideos' },
  { id: 'music', labelKey: 'chatCompanionFeedTabMusic' },
  { id: 'files', labelKey: 'chatCompanionFeedTabFiles' },
  { id: 'activity', labelKey: 'chatCompanionFeedTabActivity' },
];

const SURFACE_LABEL_KEYS: Record<CompanionFeedSurface, keyof typeof messageKeys> = {
  photo: 'chatCompanionFeedSurfacePhotoLabel',
  video: 'chatCompanionFeedSurfaceVideoLabel',
  music: 'chatCompanionFeedSurfaceMusicLabel',
  file: 'chatCompanionFeedSurfaceFileLabel',
};

function CompanionPostsEmptyState({
  catName,
  translate,
}: {
  catName: string;
  translate: TranslateFn;
}) {
  return (
    <div className="companionEmptyState">
      <p>{translate(messageKeys.chatCompanionFeedPostEmptyState, { catName })}</p>
    </div>
  );
}

function CompanionMediaEmptyState({
  surfaceLabel,
  translate,
}: {
  surfaceLabel: string;
  translate: TranslateFn;
}) {
  return (
    <div className="companionEmptyState">
      <p>{translate(messageKeys.chatCompanionFeedMediaEmptyState, { type: surfaceLabel })}</p>
    </div>
  );
}

function CompanionActivityEmptyState({ translate }: { translate: TranslateFn }) {
  return (
    <div className="companionEmptyState">
      <p>{translate(messageKeys.chatCompanionFeedActivityEmptyState)}</p>
    </div>
  );
}

function formatActivityTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function renderActivity(
  projection: CompanionActivityProjection | null | undefined,
  translate: TranslateFn,
): ReactNode {
  const entries = projection?.entries ?? [];
  if (entries.length === 0) {
    return <CompanionActivityEmptyState translate={translate} />;
  }
  return (
    <div className="companionActivityList">
      <ul>
        {entries.map((entry: CompanionActivityRenderEntry) => (
          <li key={entry.id} className="companionActivityEntry" data-group={entry.group}>
            <time className="companionActivityTimestamp" dateTime={entry.occurredAt}>
              {formatActivityTimestamp(entry.occurredAt)}
            </time>
            <span className="companionActivitySummary">{entry.summary}</span>
            {entry.count > 1 ? <span className="companionActivityCount">×{entry.count}</span> : null}
          </li>
        ))}
      </ul>
      {projection?.olderHidden ? (
        <p className="companionActivityHidden">
          {translate(messageKeys.chatCompanionFeedActivityHiddenState)}
        </p>
      ) : null}
    </div>
  );
}

function renderProfilePosts(
  profile: CompanionProfileReadModel | null | undefined,
  catName: string,
  translate: TranslateFn,
  mediaItemsLabel: (count: number) => string,
): ReactNode {
  const posts = profile?.posts ?? [];
  const active = posts.filter((post) => post.status === 'active');
  if (active.length === 0) {
    return <CompanionPostsEmptyState catName={catName} translate={translate} />;
  }
  return (
    <div className="companionProfilePostList">
      {active.map((post) => (
        <article key={post.id} className="companionProfilePostCard">
          <header className="companionProfilePostHeader">
            <h3 className="companionProfilePostTitle">{post.title}</h3>
            <time className="companionProfilePostTimestamp" dateTime={post.publishedAt}>
              {post.publishedAt}
            </time>
          </header>
          {post.body ? <p className="companionProfilePostBody">{post.body}</p> : null}
          {post.tags.length > 0 ? (
            <ul className="companionProfilePostTags">
              {post.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          ) : null}
          {post.mediaRefs.length > 0 ? (
            <div className="companionProfilePostMediaGrid" aria-label={mediaItemsLabel(post.mediaRefs.length)}>
              {post.mediaRefs.map((ref) => (
                <span
                  key={`${ref.kind}:${ref.id}`}
                  className="companionProfilePostMediaTile"
                  data-kind={ref.kind}
                  data-id={ref.id}
                />
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function renderProfileMedia(
  tiles: CompanionProfileReadModel['photos'] | undefined,
  surface: 'photo' | 'video' | 'music',
  surfaceLabel: string,
  translate: TranslateFn,
  mediaItemsLabel: string,
): ReactNode {
  const items = tiles ?? [];
  if (items.length === 0) {
    return <CompanionMediaEmptyState surfaceLabel={surfaceLabel} translate={translate} />;
  }
  return (
    <ul
      className={`companionProfileMediaList companionProfileMediaList--${surface}`}
      aria-label={mediaItemsLabel}
    >
      {items.map((tile) => (
        <li key={tile.id} className="companionProfileMediaTile">
          <span className="companionProfileMediaTitle">{tile.title}</span>
          {tile.mimeType ? <span className="companionProfileMediaMime">{tile.mimeType}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function renderProfileFiles(
  tiles: CompanionProfileReadModel['files'] | undefined,
  surfaceLabel: string,
  translate: TranslateFn,
  mediaItemsLabel: string,
): ReactNode {
  const items = tiles ?? [];
  if (items.length === 0) {
    return <CompanionMediaEmptyState surfaceLabel={surfaceLabel} translate={translate} />;
  }
  return (
    <ul className="companionProfileFileList" aria-label={mediaItemsLabel}>
      {items.map((tile) => (
        <li key={tile.id} className="companionProfileFileRow">
          <span className="companionProfileFileTitle">{tile.title}</span>
          {tile.mimeType ? <span className="companionProfileFileMime">{tile.mimeType}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export interface CompanionFeedProps {
  cat: ChatCat;
  /**
   * Projection data fetched via `useCompanionProfile`. When `null` (initial
   * fetch) the empty-state placeholders render so the layout stays stable.
   */
  profile?: CompanionProfileReadModel | null;
  /**
   * Aggregated activity projection fetched via `useCompanionActivity`.
   * When `null` (initial fetch) the empty state renders so the layout stays
   * stable.
   */
  activity?: CompanionActivityProjection | null;
}

export function CompanionFeed({ cat, profile = null, activity = null }: CompanionFeedProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('posts');
  const { t } = useI18n();

  const surfaceLabels: Record<CompanionFeedSurface, string> = {
    photo: t(SURFACE_LABEL_KEYS.photo),
    video: t(SURFACE_LABEL_KEYS.video),
    music: t(SURFACE_LABEL_KEYS.music),
    file: t(SURFACE_LABEL_KEYS.file),
  };

  const mediaItemsLabel = (count: number, surfaceLabel: string): string =>
    t(messageKeys.chatCompanionFeedMediaItemsLabel, {
      count,
      surface: surfaceLabel,
    });

  useEffect(() => {
    if (!FEED_TABS.some((tab) => tab.id === activeTab)) {
      setActiveTab('posts');
    }
  }, [activeTab]);

  let content: ReactNode;
  switch (activeTab) {
    case 'posts':
      content = renderProfilePosts(
        profile,
        cat.name,
        t,
        (count) => mediaItemsLabel(count, t(messageKeys.chatCompanionFeedMediaItemDefaultLabel)),
      );
      break;
    case 'photos':
      content = renderProfileMedia(
        profile?.photos,
        'photo',
        surfaceLabels.photo,
        t,
        mediaItemsLabel(profile?.photos?.length ?? 0, surfaceLabels.photo),
      );
      break;
    case 'videos':
      content = renderProfileMedia(
        profile?.videos,
        'video',
        surfaceLabels.video,
        t,
        mediaItemsLabel(profile?.videos?.length ?? 0, surfaceLabels.video),
      );
      break;
    case 'music':
      content = renderProfileMedia(
        profile?.music,
        'music',
        surfaceLabels.music,
        t,
        mediaItemsLabel(profile?.music?.length ?? 0, surfaceLabels.music),
      );
      break;
    case 'files':
      content = renderProfileFiles(
        profile?.files,
        surfaceLabels.file,
        t,
        mediaItemsLabel(profile?.files?.length ?? 0, surfaceLabels.file),
      );
      break;
    case 'activity':
      content = renderActivity(activity, t);
      break;
  }

  return (
    <div className="companionFeed">
      <nav
        className="companionFeedTabs"
        role="tablist"
        aria-label={t(messageKeys.chatCompanionFeedNavAriaLabel)}
      >
        {FEED_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={
              activeTab === tab.id
                ? 'companionFeedTab companionFeedTabActive'
                : 'companionFeedTab'
            }
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>
      <div className="companionFeedContent">{content}</div>
    </div>
  );
}
