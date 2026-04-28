import { useEffect, useState, type ReactNode } from 'react';

import type { ChatCat } from '../../../api/contracts.js';
import type { CompanionProfileReadModel } from '../../../companion/profileReadModel.js';
import type {
  CompanionActivityProjection,
  CompanionActivityRenderEntry,
} from '../../../companion/activityProjection.js';

type FeedTab = 'posts' | 'photos' | 'videos' | 'music' | 'files' | 'activity';

const FEED_TABS: ReadonlyArray<{ id: FeedTab; label: string }> = [
  { id: 'posts', label: 'Posts' },
  { id: 'photos', label: 'Photos' },
  { id: 'videos', label: 'Videos' },
  { id: 'music', label: 'Music' },
  { id: 'files', label: 'Files' },
  { id: 'activity', label: 'Activity' },
];

const SURFACE_LABELS: Record<'photo' | 'video' | 'music' | 'file', string> = {
  photo: 'photos',
  video: 'videos',
  music: 'music',
  file: 'files',
};

function CompanionPostsEmptyState({ catName }: { catName: string }) {
  return (
    <div className="companionEmptyState">
      <p>{catName} hasn't posted anything yet.</p>
    </div>
  );
}

function CompanionMediaEmptyState({
  surface,
}: {
  surface: 'photo' | 'video' | 'music' | 'file';
}) {
  return (
    <div className="companionEmptyState">
      <p>No {SURFACE_LABELS[surface]} yet.</p>
    </div>
  );
}

function CompanionActivityEmptyState() {
  return (
    <div className="companionEmptyState">
      <p>Nothing recent.</p>
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

function renderActivity(projection: CompanionActivityProjection | null | undefined): ReactNode {
  const entries = projection?.entries ?? [];
  if (entries.length === 0) {
    return <CompanionActivityEmptyState />;
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
            {entry.count > 1 ? (
              <span className="companionActivityCount">×{entry.count}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {projection?.olderHidden ? (
        <p className="companionActivityHidden">Older activity is hidden.</p>
      ) : null}
    </div>
  );
}

function renderProfilePosts(
  profile: CompanionProfileReadModel | null | undefined,
  catName: string,
): ReactNode {
  const posts = profile?.posts ?? [];
  const active = posts.filter((post) => post.status === 'active');
  if (active.length === 0) {
    return <CompanionPostsEmptyState catName={catName} />;
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
            <div
              className="companionProfilePostMediaGrid"
              aria-label={`${post.mediaRefs.length} media items`}
            >
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
): ReactNode {
  const items = tiles ?? [];
  if (items.length === 0) {
    return <CompanionMediaEmptyState surface={surface} />;
  }
  return (
    <ul
      className={`companionProfileMediaList companionProfileMediaList--${surface}`}
      aria-label={`${items.length} ${SURFACE_LABELS[surface]}`}
    >
      {items.map((tile) => (
        <li key={tile.id} className="companionProfileMediaTile">
          <span className="companionProfileMediaTitle">{tile.title}</span>
          {tile.mimeType ? (
            <span className="companionProfileMediaMime">{tile.mimeType}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function renderProfileFiles(
  tiles: CompanionProfileReadModel['files'] | undefined,
): ReactNode {
  const items = tiles ?? [];
  if (items.length === 0) {
    return <CompanionMediaEmptyState surface="file" />;
  }
  return (
    <ul
      className="companionProfileFileList"
      aria-label={`${items.length} files`}
    >
      {items.map((tile) => (
        <li key={tile.id} className="companionProfileFileRow">
          <span className="companionProfileFileTitle">{tile.title}</span>
          {tile.mimeType ? (
            <span className="companionProfileFileMime">{tile.mimeType}</span>
          ) : null}
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

  useEffect(() => {
    if (!FEED_TABS.some((tab) => tab.id === activeTab)) {
      setActiveTab('posts');
    }
  }, [activeTab]);

  let content: ReactNode;
  switch (activeTab) {
    case 'posts':
      content = renderProfilePosts(profile, cat.name);
      break;
    case 'photos':
      content = renderProfileMedia(profile?.photos, 'photo');
      break;
    case 'videos':
      content = renderProfileMedia(profile?.videos, 'video');
      break;
    case 'music':
      content = renderProfileMedia(profile?.music, 'music');
      break;
    case 'files':
      content = renderProfileFiles(profile?.files);
      break;
    case 'activity':
      content = renderActivity(activity);
      break;
  }

  return (
    <div className="companionFeed">
      <nav className="companionFeedTabs" role="tablist" aria-label="Companion feed">
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
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="companionFeedContent">{content}</div>
    </div>
  );
}
