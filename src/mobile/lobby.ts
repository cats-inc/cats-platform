import type { MobileAppShellPayload } from './contracts.js';

/**
 * Mobile-side Lobby content. Per SPEC-095 Open Question resolution
 * (commit `536215df`), mobile renders a *subset* of the platform
 * `/lobby` projection — and only against data the desktop already
 * exposes. Until a dedicated mobile lobby endpoint lands, the
 * selector below derives the lobby UX from the same
 * `MobileAppShellPayload` the sidebars consume, so nothing gets
 * fabricated in the renderer.
 */

export interface MobileLobbyStat {
  id: string;
  label: string;
  value: string;
  hint?: string;
}

export interface MobileLobbyActivityEntry {
  id: string;
  title: string;
  hint: string;
  channelId: string;
}

export interface MobileLobbyData {
  todayLabel: string;
  stats: MobileLobbyStat[];
  recentActivity: MobileLobbyActivityEntry[];
}

export interface SelectMobileLobbyOptions {
  /** Override "now" in tests so the snapshot is deterministic. */
  now?: Date;
  /** Cap on the recent-activity rows. Defaults to 3. */
  activityLimit?: number;
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function selectMobileLobby(
  payload: MobileAppShellPayload,
  options: SelectMobileLobbyOptions = {},
): MobileLobbyData {
  const now = options.now ?? new Date();
  const activityLimit = options.activityLimit ?? 3;

  const isoDate = now.toISOString().slice(0, 10);
  const todayLabel = `Today · ${DAY_NAMES[now.getDay()]} · ${isoDate}`;

  const activeChannels = payload.chat.channels.filter(
    (channel) => channel.status === 'active',
  );

  const stats: MobileLobbyStat[] = [
    {
      id: 'active-channels',
      label: 'Active conversations',
      value: String(activeChannels.length),
    },
    {
      id: 'cats',
      label: 'Cats',
      value: String(payload.chat.cats.length),
    },
    {
      id: 'channels-with-unread',
      label: 'Unread',
      value: String(
        activeChannels.filter((channel) => channel.unreadCount > 0).length,
      ),
      hint:
        activeChannels.length > 0
          ? `${activeChannels.reduce(
              (total, channel) => total + channel.unreadCount,
              0,
            )} message(s) total`
          : undefined,
    },
  ];

  const recentActivity = activeChannels
    .map((channel) => {
      const last = channel.lastMessageAt ?? channel.lastActivatedAt;
      return {
        channel,
        timestamp: last ? Date.parse(last) : 0,
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, activityLimit)
    .map(({ channel, timestamp }) => ({
      id: channel.id,
      title: channel.title,
      hint: timestamp > 0 ? formatTimeAgo(timestamp, now) : '—',
      channelId: channel.id,
    }));

  return { todayLabel, stats, recentActivity };
}

function formatTimeAgo(timestamp: number, now: Date): string {
  const elapsedMs = now.getTime() - timestamp;
  if (elapsedMs < 0) {
    return 'just now';
  }
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}
