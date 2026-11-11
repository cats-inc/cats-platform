import { CompanionPendingPosts } from './CompanionAiComposer.js';
import { useEffect, useState, type ReactNode } from 'react';

import type { ChatCat } from '../../../../products/chat/api/contracts.js';
import type { CompanionProfileReadModel } from '../../../../products/chat/companion/profileReadModel.js';
import type {
  CompanionActivityProjection,
  CompanionActivityRenderEntry,
} from '../../../../products/chat/companion/activityProjection.js';
import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import { useI18n } from '../../i18n/useI18n.js';
import { CompanionPostCard } from './CompanionPostCard.js';
import { CompanionPostComposer } from './CompanionPostComposer.js';

type FeedTab = 'posts' | 'photos' | 'videos' | 'music' | 'files' | 'activity';
type CompanionFeedSurface = 'photo' | 'video' | 'music' | 'file';
type TranslateFn = (key: MessageKey, values?: MessageInterpolationValues) => string;
type CompanionProfilePost = CompanionProfileReadModel['posts'][number];

const FEED_TABS: ReadonlyArray<{ id: FeedTab; labelKey: MessageKey }> = [
  { id: 'posts', labelKey: messageKeys.chatCompanionFeedTabPosts },
  { id: 'photos', labelKey: messageKeys.chatCompanionFeedTabPhotos },
  { id: 'videos', labelKey: messageKeys.chatCompanionFeedTabVideos },
  { id: 'music', labelKey: messageKeys.chatCompanionFeedTabMusic },
  { id: 'files', labelKey: messageKeys.chatCompanionFeedTabFiles },
  { id: 'activity', labelKey: messageKeys.chatCompanionFeedTabActivity },
];

const SURFACE_LABEL_KEYS: Record<CompanionFeedSurface, MessageKey> = {
  photo: messageKeys.chatCompanionFeedSurfacePhotoLabel,
  video: messageKeys.chatCompanionFeedSurfaceVideoLabel,
  music: messageKeys.chatCompanionFeedSurfaceMusicLabel,
  file: messageKeys.chatCompanionFeedSurfaceFileLabel,
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

/** SPEC-124 FR-13: presence entries carry `{presence, reason}` instead of a summary. */
function resolvePresenceActivityKey(entry: CompanionActivityRenderEntry): MessageKey | null {
  if (entry.group !== 'presence_changed') {
    return null;
  }
  const presence = entry.metadata?.presence;
  const reason = entry.metadata?.reason;
  if (reason === 'no_capacity') return messageKeys.chatCompanionActivityPresenceNoCapacity;
  if (reason === 'wake_failed') return messageKeys.chatCompanionActivityPresenceWakeFailed;
  if (presence === 'awake') {
    if (reason === 'owner') return messageKeys.chatCompanionActivityPresenceOwnerWoke;
    if (reason === 'keep_alive') return messageKeys.chatCompanionActivityPresenceRevived;
    return messageKeys.chatCompanionActivityPresenceWoke;
  }
  if (presence === 'sleeping') {
    if (reason === 'owner') return messageKeys.chatCompanionActivityPresenceOwnerSlept;
    if (reason === 'idle') return messageKeys.chatCompanionActivityPresenceDozed;
    return messageKeys.chatCompanionActivityPresenceSlept;
  }
  return null;
}

export function describeActivityEntry(entry: CompanionActivityRenderEntry, translate: TranslateFn): string {
  const presenceKey = resolvePresenceActivityKey(entry);
  return presenceKey ? translate(presenceKey) : entry.summary;
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
            <span className="companionActivitySummary">{describeActivityEntry(entry, translate)}</span>
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
          {tile.url && (surface === 'video' ? <video src={tile.url} controls playsInline preload="metadata" aria-label={tile.title} />
            : <a href={tile.url} target="_blank" rel="noreferrer"><img src={tile.url} alt={tile.title} loading="lazy" /></a>)}
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
  /** Owner moderation for agent-authored posts; omitted, the cards stay read-only. */
  onRemovePost?: (post: CompanionProfilePost) => void;
  onChanged?: () => void;
}

export function CompanionFeed({
  cat,
  profile = null,
  activity = null,
  onRemovePost,
  onChanged,
}: CompanionFeedProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('posts');
  const [visiblePosts, setVisiblePosts] = useState(20);
  useEffect(() => { setVisiblePosts(20); }, [cat.id]);
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
      content = <div className="companionTimeline">
        <aside className="companionTimelineIntro"><h2>{t(messageKeys.postIntro, { name: cat.name })}</h2>
          <p>{t(messageKeys.postIntroHint)}</p>
          {(profile?.photos.length ?? 0) > 0 && <div className="companionTimelinePhotoPreview">
            {profile!.photos.filter(item => item.url).slice(0, 6).map(item => <button key={item.id} type="button" onClick={() => setActiveTab('photos')}>
              <img src={item.url} alt={item.title} loading="lazy" />
            </button>)}
          </div>}
        </aside>
        <div className="companionTimelineMain">
          {onChanged && <><CompanionPostComposer key={cat.id} cat={cat} onPublished={onChanged} /><CompanionPendingPosts key={`pending:${cat.id}`} catId={cat.id} onChanged={onChanged} /></>}
          <div className="companionTimelineHeading"><h2>{t(messageKeys.postFeedTitle)}</h2><span>{t(messageKeys.postFeedAbout, { name: cat.name })}</span></div>
          {(profile?.posts.filter(post => post.status === 'active').length ?? 0) === 0
            ? <CompanionPostsEmptyState catName={cat.name} translate={t} />
            : <div className="companionProfilePostList">{profile!.posts.filter(post => post.status === 'active').slice(0, visiblePosts).map(post =>
              <CompanionPostCard key={post.id} cat={cat} post={post} onChanged={onChanged} onRemove={onRemovePost} />)}</div>}
          {(profile?.posts.filter(post => post.status === 'active').length ?? 0) > visiblePosts &&
            <button type="button" className="companionActionButton" onClick={() => setVisiblePosts(count => count + 20)}>{t(messageKeys.postLoadMore)}</button>}
        </div>
      </div>;
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
