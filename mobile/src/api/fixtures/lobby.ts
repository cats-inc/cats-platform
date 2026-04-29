/**
 * Fixture for the Lobby tab. Phase 6 ships the visual shell with this
 * data; live `/lobby` projection lands in a follow-up slice once the
 * SPEC-095 Open Question on Lobby content scoping (mobile-truncated
 * vs mobile-specific subset) is resolved.
 */

export interface LobbySummaryStat {
  id: string;
  label: string;
  value: string;
  /** Optional hint shown below the value. */
  hint?: string;
}

export interface LobbyActivityEntry {
  id: string;
  title: string;
  /** Time-ago hint, e.g. `12 min ago`. */
  hint: string;
  /** Channel id this activity links into, if any. */
  channelId?: string;
}

export interface LobbyGuideAssist {
  greeting: string;
  suggestion: string;
}

export interface LobbyData {
  todayLabel: string;
  stats: LobbySummaryStat[];
  recentActivity: LobbyActivityEntry[];
  guideAssist: LobbyGuideAssist;
}

export const lobbyFixture: LobbyData = {
  todayLabel: 'Today · 2026-04-29',
  stats: [
    {
      id: 'pending-approvals',
      label: 'Pending approvals',
      value: '2',
      hint: 'oldest 14 min',
    },
    {
      id: 'tasks-completed',
      label: 'Tasks today',
      value: '7',
      hint: '5 ✓ · 2 in progress',
    },
    {
      id: 'escalations',
      label: 'Escalations',
      value: '0',
    },
  ],
  recentActivity: [
    {
      id: 'a1',
      title: 'Coder Cat finished "Fix login bug"',
      hint: '12 min ago',
      channelId: 'channel-code-bug-fix',
    },
    {
      id: 'a2',
      title: 'Companion sent the morning briefing on Telegram',
      hint: 'today 08:01',
      channelId: 'channel-companion-morning',
    },
    {
      id: 'a3',
      title: 'Boss Cat queued 3 work items for review',
      hint: '1 hr ago',
    },
  ],
  guideAssist: {
    greeting: 'Hey — three things to glance at this morning.',
    suggestion:
      'You have two approvals waiting. Tap Pending approvals to clear them, or open the +New code surface to start the next feature.',
  },
};
