import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode, type RefObject } from 'react';

import type { AppShellPayload, ChatChannelSummary } from '../src/products/chat/api/contracts.ts';
import {
  buildNewCompareChatPath,
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
    setupCompleteAt: '2026-04-01T00:00:00.000Z',
    runtimeReachable: true,
    runtimeBaseUrl: 'http://localhost:8484',
    metadata: {
      generatedAt: '2026-04-01T00:00:00.000Z',
      requestId: 'test-request',
      version: 'test',
    },
    chat: {
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
      concurrentGroups: [
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
    onStartNewCompareChat: () => {},
    onSelect: () => {},
    onDeleteChannel: () => {},
    onRenameChannel: () => {},
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
  assert.match(text, /Parallel chat/i);
  assert.match(text, /Parallel chat 1/i);
  assert.deepEqual(labels, ['Claude Sonnet 4', 'GPT-5']);
});

test('compare chat route helpers keep compare mode explicit and accept legacy parallel mode', () => {
  assert.equal(buildNewCompareChatPath(), '/chat/new?mode=compare');
  assert.equal(readNewChatMode('?mode=compare'), 'compare');
  assert.equal(readNewChatMode('?mode=parallel'), 'compare');
  assert.equal(readNewChatMode(''), 'default');
});
