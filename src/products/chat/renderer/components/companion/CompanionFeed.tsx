import { useState, type CSSProperties, type ReactNode } from 'react';

import type { ChatCat } from '../../../api/contracts.js';
import { catInitials } from '../../chatUtils.js';

type FeedTab = 'posts' | 'videos' | 'photos' | 'music' | 'files';

const FEED_TABS: ReadonlyArray<{ id: FeedTab; label: string }> = [
  { id: 'posts', label: 'Posts' },
  { id: 'videos', label: 'Videos' },
  { id: 'photos', label: 'Photos' },
  { id: 'music', label: 'Music' },
  { id: 'files', label: 'Files' },
];

interface MockPost {
  id: string;
  postedAt: string;
  body: string;
  hashtags?: string[];
  media?: string[];
  likes: number;
  hearts: number;
}

const MOCK_POSTS: MockPost[] = [
  {
    id: 'p1',
    postedAt: 'Apr 26 · 7:27 PM',
    body: 'Two days in a row at the small dome arena!',
    hashtags: [
      '#StellaChang',
      '#FriendsForever',
      '#WuChiHsien',
      '#LiangWenYin',
      '#Ella',
      '#LinXinRu',
      '#YangChinHua',
      '#HsuFuKai',
    ],
    media: ['hue-280', 'hue-22', 'hue-205', 'hue-340', 'hue-185'],
    likes: 17,
    hearts: 4,
  },
  {
    id: 'p2',
    postedAt: 'Apr 24 · 10:12 AM',
    body:
      'Reading notes from this week — synthesis on attention spans, ambient computing, and why low-latency feedback loops matter more than raw model size.',
    hashtags: ['#weekly', '#reading'],
    media: ['hue-150'],
    likes: 8,
    hearts: 2,
  },
  {
    id: 'p3',
    postedAt: 'Apr 22 · 3:48 PM',
    body: 'Quick thought: the best agents feel like a calm collaborator, not a chatty one. Restraint is a feature.',
    likes: 3,
    hearts: 1,
  },
];

interface MockVideo {
  id: string;
  title: string;
  duration: string;
  hue: number;
}

const MOCK_VIDEOS: MockVideo[] = [
  { id: 'v1', title: 'Lab demo · v0.4 walkthrough', duration: '3:12', hue: 220 },
  { id: 'v2', title: 'Concert highlights — small dome', duration: '1:48', hue: 320 },
  { id: 'v3', title: 'Field recording · Tokyo back alley', duration: '4:05', hue: 60 },
  { id: 'v4', title: 'Practice take · piano', duration: '2:21', hue: 145 },
];

const MOCK_PHOTO_HUES: number[] = [
  18, 45, 92, 140, 178, 200, 215, 250, 290, 322, 12, 60,
  108, 158, 188, 230, 268, 310, 352, 80, 122, 198, 240, 8,
];

interface MockTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  hue: number;
}

const MOCK_TRACKS: MockTrack[] = [
  { id: 't1', title: 'Quiet Mornings', artist: 'Studio Ghibli OST', duration: '3:04', hue: 200 },
  { id: 't2', title: 'Late Bloom', artist: 'Hania Rani', duration: '4:38', hue: 285 },
  { id: 't3', title: '小巨蛋現場 · Encore', artist: 'Stella Chang', duration: '6:12', hue: 340 },
  { id: 't4', title: 'Drift Pattern 03', artist: 'Tycho', duration: '5:21', hue: 195 },
  { id: 't5', title: 'Slow Walk Home', artist: '老王樂隊', duration: '4:02', hue: 38 },
];

interface MockFile {
  id: string;
  name: string;
  kind: string;
  size: string;
  updatedAt: string;
}

const MOCK_FILES: MockFile[] = [
  { id: 'f1', name: 'weekly-synthesis.md', kind: 'Markdown', size: '12 KB', updatedAt: 'Apr 26' },
  { id: 'f2', name: 'concert-poster-draft.png', kind: 'Image', size: '1.4 MB', updatedAt: 'Apr 25' },
  { id: 'f3', name: 'reading-list-2026.pdf', kind: 'PDF', size: '320 KB', updatedAt: 'Apr 22' },
  { id: 'f4', name: 'thoughts-on-restraint.txt', kind: 'Text', size: '4 KB', updatedAt: 'Apr 22' },
];

function ThumbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 7.59 6.59C7.22 6.95 7 7.45 7 8v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-10-9.4C.4 8.6 2.2 5 5.5 5c2 0 3.4 1 4.4 2.4h.2c1-1.4 2.4-2.4 4.4-2.4 3.3 0 5.1 3.6 3.5 6.6C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function buildMediaTileStyle(seed: string): CSSProperties {
  const hue = parseInt(seed.replace(/^hue-/, ''), 10);
  const safeHue = Number.isFinite(hue) ? hue : 200;
  const second = (safeHue + 60) % 360;
  return {
    backgroundImage: `linear-gradient(135deg, hsl(${safeHue} 70% 55%) 0%, hsl(${second} 65% 38%) 100%)`,
  };
}

function buildPhotoTileStyle(hue: number, index: number): CSSProperties {
  const second = (hue + 35 + (index % 3) * 8) % 360;
  return {
    backgroundImage: `linear-gradient(${135 + (index % 4) * 8}deg, hsl(${hue} 65% 60%) 0%, hsl(${second} 60% 35%) 100%)`,
  };
}

interface CompanionPostCardProps {
  post: MockPost;
  cat: ChatCat;
}

function CompanionPostCard({ post, cat }: CompanionPostCardProps) {
  const initials = catInitials(cat.name);
  const avatarStyle: CSSProperties | undefined = cat.avatarUrl
    ? {
        backgroundImage: `url(${cat.avatarUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : cat.avatarColor
      ? { background: cat.avatarColor }
      : undefined;

  const visibleMedia = post.media?.slice(0, 4) ?? [];
  const overflowCount = (post.media?.length ?? 0) - visibleMedia.length;

  return (
    <article className="companionPost">
      <header className="companionPostHeader">
        <div className="companionPostAvatar" style={avatarStyle} aria-hidden="true">
          {cat.avatarUrl ? null : initials}
        </div>
        <div className="companionPostMeta">
          <strong className="companionPostAuthor">{cat.name}</strong>
          <span className="companionPostTimestamp">
            {post.postedAt} · <span aria-hidden="true">🌐</span> Public
          </span>
        </div>
        <button
          type="button"
          className="companionPostMenuButton"
          aria-label="Post menu"
        >
          <MoreIcon />
        </button>
      </header>
      <div className="companionPostBody">
        <p className="companionPostText">{post.body}</p>
        {post.hashtags && post.hashtags.length > 0 ? (
          <p className="companionPostHashtags">
            {post.hashtags.map((tag) => (
              <span key={tag} className="companionPostHashtag">{tag}</span>
            ))}
          </p>
        ) : null}
      </div>
      {visibleMedia.length > 0 ? (
        <div
          className={`companionPostMedia companionPostMediaCount${visibleMedia.length}`}
        >
          {visibleMedia.map((seed, index) => {
            const isLast = index === visibleMedia.length - 1;
            return (
              <div
                key={`${post.id}-${index}`}
                className="companionPostMediaTile"
                style={buildMediaTileStyle(seed)}
              >
                {isLast && overflowCount > 0 ? (
                  <span className="companionPostMediaOverflow">+{overflowCount}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="companionPostStats">
        <span className="companionPostReactionGroup">
          <span className="companionPostReactionPip companionPostReactionPipLike">
            <ThumbIcon />
          </span>
          {post.hearts > 0 ? (
            <span className="companionPostReactionPip companionPostReactionPipHeart">
              <HeartIcon />
            </span>
          ) : null}
        </span>
        <span className="companionPostReactionCount">{post.likes + post.hearts}</span>
      </div>
      <div className="companionPostActions">
        <button type="button" className="companionPostActionButton">
          <ThumbIcon />
          <span>Like</span>
        </button>
        <button type="button" className="companionPostActionButton">
          <HeartIcon />
          <span>Love</span>
        </button>
        <button type="button" className="companionPostActionButton">
          <ShareIcon />
          <span>Share</span>
        </button>
      </div>
    </article>
  );
}

function CompanionPhotoGrid() {
  return (
    <div className="companionPhotoGrid">
      {MOCK_PHOTO_HUES.map((hue, index) => (
        <div
          key={`photo-${index}`}
          className="companionPhotoTile"
          style={buildPhotoTileStyle(hue, index)}
        />
      ))}
    </div>
  );
}

function CompanionVideoGrid() {
  return (
    <div className="companionVideoGrid">
      {MOCK_VIDEOS.map((video) => (
        <article key={video.id} className="companionVideoCard">
          <div
            className="companionVideoThumb"
            style={buildPhotoTileStyle(video.hue, 0)}
          >
            <span className="companionVideoPlayBadge" aria-hidden="true">
              <PlayIcon />
            </span>
            <span className="companionVideoDuration">{video.duration}</span>
          </div>
          <div className="companionVideoMeta">
            <strong>{video.title}</strong>
            <span className="companionVideoSubtle">
              Apr · {video.duration} · 12 plays
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function CompanionMusicList() {
  return (
    <ul className="companionMusicList">
      {MOCK_TRACKS.map((track, index) => (
        <li key={track.id} className="companionMusicItem">
          <span className="companionMusicIndex">{index + 1}</span>
          <div
            className="companionMusicArt"
            style={buildPhotoTileStyle(track.hue, index)}
            aria-hidden="true"
          >
            <MusicIcon />
          </div>
          <div className="companionMusicMeta">
            <strong>{track.title}</strong>
            <span className="companionMusicSubtle">{track.artist}</span>
          </div>
          <span className="companionMusicDuration">{track.duration}</span>
        </li>
      ))}
    </ul>
  );
}

function CompanionFileList() {
  return (
    <ul className="companionFileList">
      {MOCK_FILES.map((file) => (
        <li key={file.id} className="companionFileItem">
          <span className="companionFileIcon" aria-hidden="true">
            <FileIcon />
          </span>
          <div className="companionFileMeta">
            <strong>{file.name}</strong>
            <span className="companionFileSubtle">
              {file.kind} · {file.size} · Updated {file.updatedAt}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface CompanionFeedProps {
  cat: ChatCat;
}

export function CompanionFeed({ cat }: CompanionFeedProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('posts');

  let content: ReactNode;
  switch (activeTab) {
    case 'posts':
      content = (
        <div className="companionPostList">
          {MOCK_POSTS.map((post) => (
            <CompanionPostCard key={post.id} post={post} cat={cat} />
          ))}
        </div>
      );
      break;
    case 'videos':
      content = <CompanionVideoGrid />;
      break;
    case 'photos':
      content = <CompanionPhotoGrid />;
      break;
    case 'music':
      content = <CompanionMusicList />;
      break;
    case 'files':
      content = <CompanionFileList />;
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
