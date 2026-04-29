import type { ChatSidebarData } from '../../renderer/sidebars/types';

/**
 * Fixture data for the Chat sidebar. PLAN-084 Phase 3 ships the sidebar
 * shape with this fixture; Phase 4 swaps it out for live data via the
 * real chat API client (`cats-platform/mobile/src/api/`).
 */
export const chatSidebarFixture: ChatSidebarData = {
  recents: [
    {
      id: 'channel-companion-morning',
      title: 'Morning briefing with Companion',
      subtitle: 'Companion · today 08:01',
      updatedAt: Date.parse('2026-04-29T08:01:00Z'),
    },
    {
      id: 'channel-runtime-debug',
      title: 'Runtime debug — slow session diagnostics',
      subtitle: 'Boss Cat · today 02:14',
      updatedAt: Date.parse('2026-04-29T02:14:00Z'),
    },
    {
      id: 'channel-product-spec-review',
      title: 'Mobile shell spec review',
      subtitle: 'Group · yesterday',
      updatedAt: Date.parse('2026-04-28T14:30:00Z'),
    },
    {
      id: 'channel-customer-followup',
      title: 'Customer A follow-up',
      subtitle: 'Telegram · 3 days ago',
      updatedAt: Date.parse('2026-04-26T12:00:00Z'),
    },
  ],
  cats: [
    {
      id: 'cat-boss',
      name: 'Boss Cat',
      avatarColor: '#C4653A',
      status: 'ready',
    },
    {
      id: 'cat-coder',
      name: 'Coder Cat',
      avatarColor: '#2F7B7A',
      status: 'warm',
    },
    {
      id: 'cat-companion',
      name: 'Companion',
      avatarColor: '#8B7E74',
      status: 'ready',
    },
    {
      id: 'cat-reviewer',
      name: 'Reviewer Cat',
      avatarColor: '#7A5C8C',
      status: 'sleeping',
    },
  ],
};
