import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode, type RefObject } from 'react';

import type { AppShellPayload, ChatChannelSummary } from '../src/shared/app-shell.ts';
import { buildNewChatPath } from '../src/shared/channelPaths.ts';
import { Sidebar } from '../src/products/chat/renderer/components/Sidebar.tsx';
import { resolveMyCatNavigationTarget } from '../src/products/chat/renderer/myCatNavigation.ts';

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => textContent(child)).join('');
  }

  if (isValidElement(node)) {
    return textContent(node.props.children);
  }

  return '';
}

function findMyCatButton(node: ReactNode, catName: string): { props: { onClick?: () => void } } {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findMyCatButton(child, catName);
      if (match) {
        return match;
      }
    }
    throw new Error(`My Cats button for "${catName}" not found.`);
  }

  if (!isValidElement(node)) {
    throw new Error(`My Cats button for "${catName}" not found.`);
  }

  const className = typeof node.props.className === 'string' ? node.props.className : '';
  if (
    node.type === 'button'
    && className.includes('myCatItem')
    && textContent(node.props.children).includes(catName)
  ) {
    return node as { props: { onClick?: () => void } };
  }

  const children = node.props.children;
  if (!children) {
    throw new Error(`My Cats button for "${catName}" not found.`);
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      try {
        return findMyCatButton(child, catName);
      } catch {
        continue;
      }
    }
    throw new Error(`My Cats button for "${catName}" not found.`);
  }

  return findMyCatButton(children, catName);
}

function collectChannelProps(node: ReactNode): Array<{ id: string; title: string }> {
  const result: Array<{ id: string; title: string }> = [];
  (function walk(n: ReactNode) {
    if (!n) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!isValidElement(n)) return;
    if (n.props.channel && typeof n.props.channel === 'object' && 'id' in n.props.channel) {
      result.push({ id: n.props.channel.id, title: n.props.channel.title });
      return;
    }
    const ch = n.props.children;
    if (Array.isArray(ch)) ch.forEach(walk);
    else if (ch) walk(ch);
  })(node);
  return result;
}

function createChannel(
  overrides: Partial<ChatChannelSummary> & { id: string; title: string },
): ChatChannelSummary {
  return {
    id: overrides.id,
    title: overrides.title,
    topic: '',
    status: 'active',
    unreadCount: 0,
    catCount: 1,
    activeCatCount: 1,
    repoPath: null,
    chatCwd: null,
    lastMessageAt: null,
    lastActivatedAt: null,
    ...overrides,
  };
}

function createPayload(channels: ChatChannelSummary[]): AppShellPayload {
  return {
    ownerDisplayName: 'Ken',
    setupCompleteAt: '2026-03-23T00:00:00.000Z',
    runtimeReachable: true,
    runtimeBaseUrl: 'http://localhost:8484',
    chat: {
      bossCatId: 'boss-cat',
      cats: [
        {
          id: 'boss-cat',
          name: 'Boss Cat',
          provider: 'openai',
          instance: null,
          model: 'gpt-5',
          status: 'active',
          createdAt: '2026-03-23T00:00:00.000Z',
          updatedAt: '2026-03-23T00:00:00.000Z',
          archivedAt: null,
          avatarColor: '#8B7E74',
          defaultExecutionTarget: { provider: 'openai', instance: null, model: 'gpt-5' },
          memory: { summary: null, updatedAt: null },
          skillProfile: null,
          mcpProfile: null,
        },
        {
          id: 'companion-cat',
          name: 'Companion',
          provider: 'openai',
          instance: null,
          model: 'gpt-5-mini',
          status: 'active',
          createdAt: '2026-03-23T00:00:00.000Z',
          updatedAt: '2026-03-23T00:00:00.000Z',
          archivedAt: null,
          avatarColor: '#5B8DEF',
          defaultExecutionTarget: { provider: 'openai', instance: null, model: 'gpt-5-mini' },
          memory: { summary: null, updatedAt: null },
          skillProfile: null,
          mcpProfile: null,
        },
      ],
      channels,
      selectedChannel: null,
      selectedChannelId: null,
      globalOrchestrator: {
        status: 'ready',
        nextFocus: 'Steady state',
        entrypoints: [],
        referenceProjects: [],
        notes: [],
        executionTarget: { provider: 'openai', instance: null, model: 'gpt-5' },
        systemPrompt: 'You are Boss Cat.',
      },
      capabilities: {
        chat: true,
        work: false,
        code: false,
      },
      showVerboseMessages: false,
      botBindings: [],
    },
  };
}

function createSidebarTree(
  payload: AppShellPayload,
  onDirectChatCat: (catId: string) => void,
): ReactNode {
  return Sidebar({
    payload,
    sidebarOpen: true,
    accountMenuOpen: false,
    overflowMenuOpenId: null,
    busy: '',
    surface: 'chats',
    routeChannelId: null,
    sidebarView: 'latest',
    accountMenuRef: { current: null } as RefObject<HTMLDivElement | null>,
    onToggleSidebar: () => {},
    onCollapsedSidebarClick: () => {},
    onOpenChatsOverview: () => {},
    onStartNewChat: () => {},
    onSelect: () => {},
    onDeleteChannel: () => {},
    onAccountMenuToggle: () => {},
    onOverflowMenuToggle: () => {},
    onNavigateSettings: () => {},
    onSidebarViewChange: () => {},
    activeMyCatId: null,
    onDirectChatCat,
  });
}

test('clicking a My Cats entry without an existing direct thread opens a direct draft lane', () => {
  const payload = createPayload([]);
  const actions: Array<{ kind: 'navigate'; path: string } | { kind: 'select'; channelId: string }> = [];

  const tree = createSidebarTree(payload, (catId) => {
    const target = resolveMyCatNavigationTarget(payload.chat.channels, catId);
    if (target.kind === 'existing_channel') {
      actions.push({ kind: 'select', channelId: target.channelId });
      return;
    }
    actions.push({ kind: 'navigate', path: target.path });
  });

  const companionButton = findMyCatButton(tree, 'Companion');
  companionButton.props.onClick?.();

  assert.deepEqual(actions, [
    { kind: 'navigate', path: buildNewChatPath('companion-cat') },
  ]);
});

test('clicking a My Cats entry with an existing direct thread reopens that thread', () => {
  const payload = createPayload([
    createChannel({
      id: 'direct-thread-1',
      title: 'Companion',
      leadCatId: 'companion-cat',
      roomMode: 'direct_cat_chat',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);
  const actions: Array<{ kind: 'navigate'; path: string } | { kind: 'select'; channelId: string }> = [];

  const tree = createSidebarTree(payload, (catId) => {
    const target = resolveMyCatNavigationTarget(payload.chat.channels, catId);
    if (target.kind === 'existing_channel') {
      actions.push({ kind: 'select', channelId: target.channelId });
      return;
    }
    actions.push({ kind: 'navigate', path: target.path });
  });

  const companionButton = findMyCatButton(tree, 'Companion');
  companionButton.props.onClick?.();

  assert.deepEqual(actions, [
    { kind: 'select', channelId: 'direct-thread-1' },
  ]);
});

test('direct_cat_chat channels are excluded from the Recents list', () => {
  const payload = createPayload([
    createChannel({ id: 'boss-thread', title: 'Daily standup' }),
    createChannel({
      id: 'direct-thread',
      title: 'Companion',
      leadCatId: 'companion-cat',
      roomMode: 'direct_cat_chat',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);

  const tree = createSidebarTree(payload, () => {});
  const rendered = collectChannelProps(tree);

  assert.ok(
    rendered.some((ch) => ch.id === 'boss-thread'),
    'boss_chat channel should appear in Recents',
  );
  assert.ok(
    !rendered.some((ch) => ch.id === 'direct-thread'),
    'direct_cat_chat channel should not appear in Recents',
  );
});
