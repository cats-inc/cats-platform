import { useEffect, useState, type ReactNode } from 'react';

import type { ChatCat } from '../../../api/contracts.js';
import type { CompanionProfileReadModel } from '../../../companion/profileReadModel.js';

type FeedTab = 'posts' | 'photos' | 'videos' | 'music' | 'files' | 'activity';

const FEED_TABS: ReadonlyArray<{ id: FeedTab; label: string }> = [
  { id: 'posts', label: 'Posts' },
  { id: 'photos', label: 'Photos' },
  { id: 'videos', label: 'Videos' },
  { id: 'music', label: 'Music' },
  { id: 'files', label: 'Files' },
  { id: 'activity', label: 'Activity' },
];

function CompanionActivityPlaceholder() {
  return (
    <div className="companionEmptyState">
      <p>Activity is empty.</p>
      <p className="companionEmptyStateHint">
        PLAN-077 Phase 2 will populate this with aggregated source / memory /
        derived activity.
      </p>
    </div>
  );
}

function CompanionPostsEmptyState() {
  return (
    <div className="companionEmptyState">
      <p>No posts yet.</p>
      <p className="companionEmptyStateHint">
        Promote a source, file, or media tile to feature it here.
      </p>
    </div>
  );
}

const MEDIA_SURFACE_LABELS: Record<'photo' | 'video' | 'music' | 'file', string> = {
  photo: 'photos',
  video: 'videos',
  music: 'music',
  file: 'files',
};

function CompanionMediaEmptyState({
  surface,
}: {
  surface: 'photo' | 'video' | 'music' | 'file';
}) {
  return (
    <div className="companionEmptyState">
      <p>No {MEDIA_SURFACE_LABELS[surface]} yet.</p>
      <p className="companionEmptyStateHint">
        Add a source through Sources to see it here.
      </p>
    </div>
  );
}

function renderProfilePosts(
  profile: CompanionProfileReadModel | null | undefined,
  onRemovePost?: (derivedId: string) => Promise<void>,
): ReactNode {
  const posts = profile?.posts ?? [];
  const active = posts.filter((post) => post.status === 'active');
  if (active.length === 0) {
    return <CompanionPostsEmptyState />;
  }
  return (
    <div className="companionProfilePostList">
      {active.map((post) => (
        <article key={post.id} className="companionProfilePostCard">
          <header className="companionProfilePostHeader">
            <h3 className="companionProfilePostTitle">{post.title}</h3>
            <time className="companionProfilePostTimestamp" dateTime={post.promotedAt}>
              {post.promotedAt}
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
          {onRemovePost ? (
            <button
              type="button"
              className="companionDangerButton"
              onClick={() => {
                void onRemovePost(post.derivedId);
              }}
            >
              Remove from Posts
            </button>
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
      aria-label={`${items.length} ${MEDIA_SURFACE_LABELS[surface]}`}
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
   * When provided, post cards render a Remove affordance that calls this
   * handler with the underlying derived record id.
   */
  onRemovePost?: (derivedId: string) => Promise<void>;
}

export function CompanionFeed({ cat: _cat, profile = null, onRemovePost }: CompanionFeedProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('posts');

  useEffect(() => {
    if (!FEED_TABS.some((tab) => tab.id === activeTab)) {
      setActiveTab('posts');
    }
  }, [activeTab]);

  let content: ReactNode;
  switch (activeTab) {
    case 'posts':
      content = renderProfilePosts(profile, onRemovePost);
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
      content = <CompanionActivityPlaceholder />;
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
