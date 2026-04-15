import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ComponentProps, type ReactNode, type RefObject } from 'react';

import { AccountIdentityMenu } from '../src/design/components/AccountIdentityMenu.tsx';
import { ConversationSidebarFooter } from '../src/app/renderer/productShell/ConversationSidebarFooter.tsx';
import { ConversationSidebarNavigation } from '../src/app/renderer/productShell/ConversationSidebarNavigation.tsx';
import { ConversationSidebarRecentsSection } from '../src/app/renderer/productShell/ConversationSidebarRecents.tsx';
import type { AppShellPayload, ChatChannelSummary } from '../src/products/chat/api/contracts.ts';
import {
  buildNewGroupChatPath,
  buildNewParallelChatPath,
  readNewChatMode,
} from '../src/products/chat/shared/channelPaths.ts';
import { Sidebar } from '../src/products/chat/renderer/components/Sidebar.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

function findElementByType<TProps>(
  node: ReactNode,
  componentType: unknown,
): { props: TProps } {
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return findElementByType<TProps>(child, componentType);
      } catch {
        continue;
      }
    }
    throw new Error('Component not found.');
  }

  if (!isValidElement(node)) {
    throw new Error('Component not found.');
  }

  if (node.type === componentType) {
    return node as { props: TProps };
  }

  const children = node.props.children;
  if (!children) {
    throw new Error('Component not found.');
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      try {
        return findElementByType<TProps>(child, componentType);
      } catch {
        continue;
      }
    }
    throw new Error('Component not found.');
  }

  return findElementByType<TProps>(children, componentType);
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
        maxChatParticipants: 5,
        maxAudienceParticipants: 3,
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
    busy: clearBusyState(),
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

  const navigation = findElementByType<{
    primaryActions: Array<{ label: string }>;
  }>(tree, ConversationSidebarNavigation);
  const recents = findElementByType<{
    entries: Array<
      | {
          kind: 'channel';
          channel: ChatChannelSummary;
          titleOverride?: string;
        }
      | {
          kind: 'group';
          title: string;
          channels: Array<{ channel: ChatChannelSummary; titleOverride?: string }>;
        }
    >;
  }>(tree, ConversationSidebarRecentsSection);
  const labels = recents.props.entries.flatMap((entry) =>
    entry.kind === 'group'
      ? entry.channels.map((channel) => channel.titleOverride ?? channel.channel.title)
      : [entry.titleOverride ?? entry.channel.title],
  );
  const groupTitles = recents.props.entries
    .filter((entry): entry is Extract<typeof entry, { kind: 'group' }> => entry.kind === 'group')
    .map((entry) => entry.title);

  assert.deepEqual(
    navigation.props.primaryActions.map((action) => action.label),
    ['New chat', 'Group chat', 'Parallel chat'],
  );
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
    busy: clearBusyState(),
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

  const navigation = findElementByType<{
    primaryActions: Array<{ label: string; onClick: () => void }>;
  }>(tree, ConversationSidebarNavigation);
  navigation.props.primaryActions.find((action) => action.label === 'Group chat')?.onClick();
  assert.deepEqual(actions, ['group']);
});

test('Sidebar wires the shared account identity menu to the runtime root', () => {
  const tree = Sidebar({
    payload: createPayload(),
    sidebarOpen: true,
    accountMenuOpen: true,
    overflowMenuOpenId: null,
    busy: clearBusyState(),
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

  const footer = findElementByType<ComponentProps<typeof ConversationSidebarFooter>>(
    tree,
    ConversationSidebarFooter,
  );
  const footerTree = ConversationSidebarFooter(footer.props);
  const accountMenu = findElementByType<{
    open?: boolean;
    menuWidth?: string;
  }>(footerTree, AccountIdentityMenu);
  assert.equal(accountMenu.props.open, true);
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
