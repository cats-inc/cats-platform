import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode, type RefObject } from 'react';

import { AccountIdentityMenu } from '../src/design/components/AccountIdentityMenu.tsx';
import type { AppShellPayload, ChatChannelSummary } from '../src/products/chat/api/contracts.ts';
import {
  buildNewGroupChatPath,
  buildNewParallelChatPath,
  readNewChatMode,
} from '../src/products/chat/shared/channelPaths.ts';
import { Sidebar } from '../src/products/chat/renderer/components/Sidebar.tsx';

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => textContent(child)).join(' ');
  }

  if (isValidElement(node)) {
    return textContent(node.props.children);
  }

  return '';
}

function collectRecentLabels(node: ReactNode): string[] {
  const labels: string[] = [];
  (function walk(current: ReactNode) {
    if (!current) {
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(walk);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }

    if (current.props.channel && typeof current.props.channel === 'object') {
      labels.push(String(current.props.titleOverride ?? current.props.channel.title));
      return;
    }

    walk(current.props.children);
  })(node);
  return labels;
}

function collectGroupTitles(node: ReactNode): string[] {
  const titles: string[] = [];
  (function walk(current: ReactNode) {
    if (!current) {
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(walk);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }

    if (
      typeof current.props.title === 'string'
      && typeof current.props.onUngroup === 'function'
      && typeof current.props.onDelete === 'function'
    ) {
      titles.push(current.props.title);
      return;
    }

    walk(current.props.children);
  })(node);
  return titles;
}

function findButtonByLabel(
  node: ReactNode,
  label: string,
): { props: { onClick?: () => void } } {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButtonByLabel(child, label);
      if (match) {
        return match;
      }
    }
    throw new Error(`Button "${label}" not found.`);
  }

  if (!isValidElement(node)) {
    throw new Error(`Button "${label}" not found.`);
  }

  if (
    node.type === 'button'
    && typeof node.props.className === 'string'
    && node.props.className.includes('navItem')
    && textContent(node.props.children).includes(label)
  ) {
    return node as { props: { onClick?: () => void } };
  }

  const children = node.props.children;
  if (!children) {
    throw new Error(`Button "${label}" not found.`);
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      try {
        return findButtonByLabel(child, label);
      } catch {
        continue;
      }
    }
    throw new Error(`Button "${label}" not found.`);
  }

  return findButtonByLabel(children, label);
}

function findAccountIdentityMenu(
  node: ReactNode,
): { props: { open?: boolean; runtimeBaseUrl?: string; menuWidth?: string } } {
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return findAccountIdentityMenu(child);
      } catch {
        continue;
      }
    }
    throw new Error('AccountIdentityMenu not found.');
  }

  if (!isValidElement(node)) {
    throw new Error('AccountIdentityMenu not found.');
  }

  if (node.type === AccountIdentityMenu) {
    return node as { props: { open?: boolean; runtimeBaseUrl?: string; menuWidth?: string } };
  }

  const children = node.props.children;
  if (!children) {
    throw new Error('AccountIdentityMenu not found.');
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      try {
        return findAccountIdentityMenu(child);
      } catch {
        continue;
      }
    }
    throw new Error('AccountIdentityMenu not found.');
  }

  return findAccountIdentityMenu(children);
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
    catCount: 0,
    activeCatCount: 0,
    repoPath: null,
    chatCwd: null,
    lastMessageAt: null,
    lastActivatedAt: null,
    ...overrides,
  };
}

function createPayload(): AppShellPayload {
  return {
    ownerDisplayName: 'Ken',
    ownerAvatarUrl: null,
    ownerAvatarColor: null,
    setupCompleteAt: '2026-04-01T00:00:00.000Z',
    runtime: {
      baseUrl: 'http://localhost:8484',
      reachable: true,
      status: 'ok',
      service: 'cats-runtime',
    },
    metadata: {
      generatedAt: '2026-04-01T00:00:00.000Z',
      requestId: 'test-request',
      version: 'test',
    },
    chat: {
      id: 'chat',
      name: 'Cats Chat',
      bossCatId: 'boss-cat',
      cats: [
        {
          id: 'boss-cat',
          name: 'Boss Cat',
          provider: 'claude',
          instance: null,
          model: 'claude-sonnet-4',
          status: 'active',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          archivedAt: null,
          avatarColor: '#8B7E74',
          avatarUrl: null,
          products: ['chat'],
          defaultExecutionTarget: { provider: 'claude', instance: null, model: 'claude-sonnet-4' },
          defaultModelSelection: null,
          memory: { summary: null, updatedAt: null },
          skillProfile: null,
          mcpProfile: null,
        },
      ],
      channels: [
        createChannel({ id: 'compare-1', title: 'Parallel chat 1' }),
        createChannel({ id: 'compare-2', title: 'Parallel chat 1' }),
      ],
      selectedChannel: null,
      selectedChannelId: 'compare-1',
      parallelChatGroups: [
        {
          id: 'compare-group-1',
          title: 'Parallel chat 1',
          mode: 'compare',
          status: 'active',
          memberCount: 2,
          memberChannelIds: ['compare-1', 'compare-2'],
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          lastMessageAt: '2026-04-01T00:05:00.000Z',
          members: [
            {
              channelId: 'compare-1',
              index: 0,
              title: 'Claude Sonnet 4',
              provider: 'claude',
              instance: null,
              model: 'claude-sonnet-4',
              modelSelection: null,
              lastMessageAt: '2026-04-01T00:05:00.000Z',
            },
            {
              channelId: 'compare-2',
              index: 1,
              title: 'GPT-5',
              provider: 'openai',
              instance: null,
              model: 'gpt-5',
              modelSelection: null,
              lastMessageAt: '2026-04-01T00:04:00.000Z',
            },
          ],
        },
      ],
      globalOrchestrator: {
        mode: 'global',
        status: 'ready',
        nextFocus: 'steady',
        entrypoints: [],
        referenceProjects: [],
        notes: [],
        executionTarget: { provider: 'claude', instance: null, model: 'claude-sonnet-4' },
        executionModelSelection: null,
        systemPrompt: 'You are Boss Cat.',
        skillProfile: null,
        mcpProfile: null,
        memory: { summary: null, updatedAt: null },
        telegramBotName: null,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      capabilities: {
        multiChannel: true,
        persistence: 'file-backed',
        mentions: 'basic',
        splitView: 'planned',
        transcriptExport: true,
        participantManagement: 'basic',
        runtimeSessions: true,
        maxBossCats: 1,
        maxCats: 8,
        maxParallelChats: 5,
        availableSurfaces: ['chat'],
      },
      newChatDefaults: {
        provider: 'claude',
        instance: null,
        model: 'claude-sonnet-4',
        modelSelection: null,
      },
      showVerboseMessages: false,
      botBindings: [],
    },
  };
}

test('Sidebar groups parallel chats and shows member labels in Recents', () => {
  const tree = Sidebar({
    payload: createPayload(),
    sidebarOpen: true,
    accountMenuOpen: false,
    overflowMenuOpenId: null,
    busy: '',
    surface: 'chats',
    routeChannelId: 'compare-1',
    accountMenuRef: { current: null } as RefObject<HTMLDivElement>,
    onToggleSidebar: () => {},
    onCollapsedSidebarClick: () => {},
    onOpenChatsOverview: () => {},
    onStartNewChat: () => {},
    onStartNewGroupChat: () => {},
    onStartNewParallelChat: () => {},
    onSelect: () => {},
    onDeleteChannel: () => {},
    onRenameChannel: () => {},
    onRenameParallelChatGroup: () => {},
    onUngroupParallelChatGroup: () => {},
    onDeleteParallelChatGroup: () => {},
    onArchiveCat: () => {},
    onAccountMenuToggle: () => {},
    onOverflowMenuToggle: () => {},
    onNavigateSettings: () => {},
    onSwitchProduct: () => {},
    activeMyCatId: null,
    onDirectChatCat: () => {},
  });

  const text = textContent(tree);
  const labels = collectRecentLabels(tree);
  const groupTitles = collectGroupTitles(tree);
  assert.match(text, /Group chat/i);
  assert.match(text, /Parallel chat/i);
  assert.deepEqual(groupTitles, ['Parallel chat 1']);
  assert.deepEqual(labels, ['Claude Sonnet 4', 'GPT-5']);
});

test('Sidebar exposes a dedicated Group chat primary action', () => {
  const actions: string[] = [];
  const tree = Sidebar({
    payload: createPayload(),
    sidebarOpen: true,
    accountMenuOpen: false,
    overflowMenuOpenId: null,
    busy: '',
    surface: 'chats',
    routeChannelId: 'compare-1',
    accountMenuRef: { current: null } as RefObject<HTMLDivElement>,
    onToggleSidebar: () => {},
    onCollapsedSidebarClick: () => {},
    onOpenChatsOverview: () => {},
    onStartNewChat: () => {
      actions.push('solo');
    },
    onStartNewGroupChat: () => {
      actions.push('group');
    },
    onStartNewParallelChat: () => {
      actions.push('parallel');
    },
    onSelect: () => {},
    onDeleteChannel: () => {},
    onRenameChannel: () => {},
    onRenameParallelChatGroup: () => {},
    onUngroupParallelChatGroup: () => {},
    onDeleteParallelChatGroup: () => {},
    onArchiveCat: () => {},
    onAccountMenuToggle: () => {},
    onOverflowMenuToggle: () => {},
    onNavigateSettings: () => {},
    onSwitchProduct: () => {},
    activeMyCatId: null,
    onDirectChatCat: () => {},
  });

  findButtonByLabel(tree, 'Group chat').props.onClick?.();
  assert.deepEqual(actions, ['group']);
});

test('Sidebar wires the shared account identity menu to the runtime root', () => {
  const tree = Sidebar({
    payload: createPayload(),
    sidebarOpen: true,
    accountMenuOpen: true,
    overflowMenuOpenId: null,
    busy: '',
    surface: 'chats',
    routeChannelId: 'compare-1',
    accountMenuRef: { current: null } as RefObject<HTMLDivElement>,
    onToggleSidebar: () => {},
    onCollapsedSidebarClick: () => {},
    onOpenChatsOverview: () => {},
    onStartNewChat: () => {},
    onStartNewGroupChat: () => {},
    onStartNewParallelChat: () => {},
    onSelect: () => {},
    onDeleteChannel: () => {},
    onRenameChannel: () => {},
    onRenameParallelChatGroup: () => {},
    onUngroupParallelChatGroup: () => {},
    onDeleteParallelChatGroup: () => {},
    onArchiveCat: () => {},
    onAccountMenuToggle: () => {},
    onOverflowMenuToggle: () => {},
    onNavigateSettings: () => {},
    onSwitchProduct: () => {},
    activeMyCatId: null,
    onDirectChatCat: () => {},
  });

  const accountMenu = findAccountIdentityMenu(tree);
  assert.equal(accountMenu.props.open, true);
  assert.equal(accountMenu.props.runtimeBaseUrl, 'http://localhost:8484');
  assert.equal(accountMenu.props.menuWidth, 'trigger');
});

test('new-chat route helpers keep group and parallel entry intents explicit', () => {
  assert.equal(buildNewGroupChatPath(), '/chat/new?mode=group');
  assert.equal(buildNewParallelChatPath(), '/chat/new?mode=parallel');
  assert.equal(readNewChatMode('?mode=group'), 'group');
  assert.equal(readNewChatMode('?mode=parallel'), 'parallel');
  assert.equal(readNewChatMode('?mode=compare'), 'default');
  assert.equal(readNewChatMode(''), 'default');
});
