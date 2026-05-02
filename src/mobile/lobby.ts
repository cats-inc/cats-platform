import type { MobileAppShellPayload } from './contracts.js';
import {
  formatMobileTimeAgo,
  formatMobileTodayLabel,
  getMobileLobbyCopy,
  resolveDefaultMobileLocale,
  resolveMobileLocale,
} from './i18n.js';

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
  /** UI locale used for Cats-owned mobile lobby copy. */
  locale?: string | null;
}

export function selectMobileLobby(
  payload: MobileAppShellPayload,
  options: SelectMobileLobbyOptions = {},
): MobileLobbyData {
  const now = options.now ?? new Date();
  const activityLimit = options.activityLimit ?? 3;
  const locale = options.locale
    ? resolveMobileLocale(options.locale)
    : resolveDefaultMobileLocale();
  const copy = getMobileLobbyCopy(locale);

  const todayLabel = formatMobileTodayLabel(now, locale);

  const activeChannels = payload.chat.channels.filter(
    (channel) => channel.status === 'active',
  );

  const stats: MobileLobbyStat[] = [
    {
      id: 'active-channels',
      label: copy.statActiveConversations,
      value: String(activeChannels.length),
    },
    {
      id: 'cats',
      label: copy.statCats,
      value: String(payload.chat.cats.length),
    },
    {
      id: 'channels-with-unread',
      label: copy.statUnread,
      value: String(
        activeChannels.filter((channel) => channel.unreadCount > 0).length,
      ),
      hint:
        activeChannels.length > 0
          ? copy.unreadTotal(activeChannels.reduce(
              (total, channel) => total + channel.unreadCount,
              0,
            ))
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
      hint: timestamp > 0 ? formatMobileTimeAgo(timestamp, now, locale) : '—',
      channelId: channel.id,
    }));

  return { todayLabel, stats, recentActivity };
}
