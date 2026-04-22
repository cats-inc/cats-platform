import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ComponentProps, type ReactNode, type RefObject } from 'react';

import { ConversationSidebarFooter } from '../src/app/renderer/productShell/ConversationSidebarFooter.tsx';
import { ConversationSidebarMyCatsSection } from '../src/app/renderer/productShell/ConversationSidebarMyCats.tsx';
import { ConversationSidebarRecentsSection } from '../src/app/renderer/productShell/ConversationSidebarRecents.tsx';
import type { AppShellPayload, ChatChannelSummary } from '../src/products/chat/api/contracts.ts';
import type { ParticipantSessionStatus } from '../src/shared/roomRouting.ts';
import { buildMyCatPath } from '../src/shared/channelPaths.ts';
import { Sidebar } from '../src/products/chat/renderer/components/Sidebar.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';
import {
  findDirectLaneForCat,
  resolveMyCatNavigationTarget,
  resolveMyCatStatusDot,
} from '../src/products/chat/renderer/myCatNavigation.ts';

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

  if (
    typeof node.type === 'function'
    && node.props?.cat
    && node.props.cat.name === catName
    && typeof node.props.onDirectChat === 'function'
  ) {
    return {
      props: {
        onClick: node.props.onDirectChat as () => void,
      },
    };
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

function createChannel(
  overrides: Partial<ChatChannelSummary> & { id: string; title: string },
): ChatChannelSummary {
  return {
    id: overrides.id,
    title: overrides.title,
    topic: '',
    originSurface: 'chat',
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

function createRuntime(reachable: boolean, status = 'ok') {
  return { baseUrl: 'http://localhost:3110', reachable, status, service: 'cats-runtime' };
}

function createPayload(channels: ChatChannelSummary[], runtime?: { baseUrl: string; reachable: boolean; status: string; service: string }): AppShellPayload {
  return {
    ownerDisplayName: 'Ken',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    setupCompleteAt: '2026-03-23T00:00:00.000Z',
    lastProductSurface: 'chat',
    guideCat: null,
    app: { name: 'cats', stage: 'phase-2-shell', runtimeBoundary: 'cats-runtime' },
    products: [],
    desktop: {
      startAtLogin: false,
      openWindowOnStartup: true,
      systemTrayEnabled: true,
    },
    lobby: {
      animationMode: 'full',
      cats: [],
    },
    runtime: runtime ?? createRuntime(true, 'ok'),
    runtimeSetup: {
      complete: true,
      checklist: [],
      availableProviders: [],
    },
    metadata: {
      generatedAt: '2026-03-23T00:00:00.000Z',
      host: 'localhost',
      port: 8484,
    },
    bootstrapAttemptId: null,
    chat: {
      id: 'chat',
      name: 'Cats Chat',
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
        mode: 'global',
        status: 'ready',
        nextFocus: 'Steady state',
        entrypoints: [],
        referenceProjects: [],
        notes: [],
        executionTarget: { provider: 'openai', instance: null, model: 'gpt-5' },
        executionModelSelection: null,
        systemPrompt: 'You are Boss Cat.',
        skillProfile: null,
        mcpProfile: null,
        memory: { summary: null, updatedAt: null },
        telegramBotName: null,
        updatedAt: '2026-03-23T00:00:00.000Z',
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
        provider: 'openai',
        instance: null,
        model: 'gpt-5',
        modelSelection: null,
      },
      showVerboseMessages: false,
      botBindings: [],
    },
  } as AppShellPayload;
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
    busy: clearBusyState(),
    surface: 'chats',
    routeChannelId: null,
    accountMenuRef: { current: null } as RefObject<HTMLDivElement | null>,
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
    onNavigateRuntime: () => {},
    onSwitchProduct: () => {},
    activeMyCatId: null,
    onDirectChatCat,
  });
}

function createMyCatsTree(tree: ReactNode): ReactNode {
  const section = findElementByType<ComponentProps<typeof ConversationSidebarMyCatsSection>>(
    tree,
    ConversationSidebarMyCatsSection,
  );
  return ConversationSidebarMyCatsSection(section.props);
}

function readRecentChannels(tree: ReactNode): Array<{ id: string; title: string }> {
  const section = findElementByType<{
    entries: Array<
      | { kind: 'channel'; channel: ChatChannelSummary }
      | { kind: 'group'; channels: Array<{ channel: ChatChannelSummary }> }
    >;
  }>(tree, ConversationSidebarRecentsSection);
  return section.props.entries.flatMap((entry) =>
    entry.kind === 'group'
      ? entry.channels.map((channel) => ({ id: channel.channel.id, title: channel.channel.title }))
      : [{ id: entry.channel.id, title: entry.channel.title }],
  );
}

function readRuntimeFooterLabel(tree: ReactNode): string {
  const footer = findElementByType<ComponentProps<typeof ConversationSidebarFooter>>(
    tree,
    ConversationSidebarFooter,
  );
  return footer.props.runtimeFooterLabel;
}

test('clicking a My Cats entry without an existing direct lane opens that Cat lane in place', () => {
  const payload = createPayload([]);
  const actions: Array<{ kind: 'navigate'; path: string }> = [];

  const tree = createSidebarTree(payload, (catId) => {
    const target = resolveMyCatNavigationTarget(payload.chat.channels, catId);
    actions.push({ kind: 'navigate', path: target.path });
  });
  const myCatsTree = createMyCatsTree(tree);

  const companionButton = findMyCatButton(myCatsTree, 'Companion');
  companionButton.props.onClick?.();

  assert.deepEqual(actions, [
    { kind: 'navigate', path: buildMyCatPath('companion-cat') },
  ]);
});

test('clicking a My Cats entry with an existing hidden direct lane stays on the My Cats route', () => {
  const payload = createPayload([
    createChannel({
      id: 'direct-thread-1',
      title: 'Companion',
      channelKind: 'direct_lane',
      defaultRecipientCatId: 'companion-cat',
      roomMode: 'direct_cat_chat',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);
  const actions: Array<{ kind: 'navigate'; path: string }> = [];

  const tree = createSidebarTree(payload, (catId) => {
    const target = resolveMyCatNavigationTarget(payload.chat.channels, catId);
    actions.push({ kind: 'navigate', path: target.path });
  });
  const myCatsTree = createMyCatsTree(tree);

  const companionButton = findMyCatButton(myCatsTree, 'Companion');
  companionButton.props.onClick?.();

  assert.deepEqual(actions, [
    { kind: 'navigate', path: buildMyCatPath('companion-cat') },
  ]);
});

test('My Cats lookup still finds direct lanes by channelKind when roomMode is legacy-mismatched', () => {
  const channels = [
    createChannel({
      id: 'direct-thread-1',
      title: 'Companion',
      channelKind: 'direct_lane',
      defaultRecipientCatId: 'companion-cat',
      roomMode: 'boss_chat',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ];

  assert.equal(findDirectLaneForCat(channels, 'companion-cat')?.id, 'direct-thread-1');
});

test('direct_cat_chat channels are excluded from the Recents list', () => {
  const payload = createPayload([
    createChannel({ id: 'boss-thread', title: 'Daily standup' }),
    createChannel({
      id: 'direct-thread',
      title: 'Companion',
      channelKind: 'direct_lane',
      defaultRecipientCatId: 'companion-cat',
      roomMode: 'boss_chat',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);

  const tree = createSidebarTree(payload, () => {});
  const rendered = readRecentChannels(tree);

  assert.ok(
    rendered.some((ch) => ch.id === 'boss-thread'),
    'boss_chat channel should appear in Recents',
  );
  assert.ok(
    !rendered.some((ch) => ch.id === 'direct-thread'),
    'direct_cat_chat channel should not appear in Recents',
  );
});

// --- Status Dot Tests ---

test('Cat with no existing direct lane shows no dot', () => {
  const channels: ChatChannelSummary[] = [];
  const lane = findDirectLaneForCat(channels, 'companion-cat');
  assert.equal(lane, null);
  assert.equal(resolveMyCatStatusDot(lane?.defaultRecipientLeaseStatus), 'no_dot');
});

test('Cat with direct lane + ready shows awake (green)', () => {
  const lane = createChannel({
    id: 'dl-1', title: 'C', channelKind: 'direct_lane', defaultRecipientCatId: 'companion-cat', roomMode: 'boss_chat',
    defaultRecipientLeaseStatus: 'ready',
  } as Partial<ChatChannelSummary> & { id: string; title: string });
  assert.equal(resolveMyCatStatusDot(lane.defaultRecipientLeaseStatus), 'awake');
});

test('Cat with direct lane + initializing shows waking_up (yellow)', () => {
  const lane = createChannel({
    id: 'dl-2', title: 'C', defaultRecipientCatId: 'companion-cat', roomMode: 'direct_cat_chat',
    defaultRecipientLeaseStatus: 'initializing',
  } as Partial<ChatChannelSummary> & { id: string; title: string });
  assert.equal(resolveMyCatStatusDot(lane.defaultRecipientLeaseStatus), 'waking_up');
});

test('Cat with direct lane + not_started shows sleeping (gray)', () => {
  const lane = createChannel({
    id: 'dl-3', title: 'C', defaultRecipientCatId: 'companion-cat', roomMode: 'direct_cat_chat',
    defaultRecipientLeaseStatus: 'not_started',
  } as Partial<ChatChannelSummary> & { id: string; title: string });
  assert.equal(resolveMyCatStatusDot(lane.defaultRecipientLeaseStatus), 'sleeping');
});

test('Cat with direct lane + closed shows sleeping (gray)', () => {
  assert.equal(resolveMyCatStatusDot('closed' as ParticipantSessionStatus), 'sleeping');
});

test('Cat with direct lane + removed shows sleeping (gray)', () => {
  assert.equal(resolveMyCatStatusDot('removed' as ParticipantSessionStatus), 'sleeping');
});

test('Cat with direct lane + error shows error (red)', () => {
  assert.equal(resolveMyCatStatusDot('error' as ParticipantSessionStatus), 'error');
});

test('Cat active in non-direct room only does not affect My Cats dot', () => {
  const channels = [
    createChannel({ id: 'boss-room', title: 'Work', defaultRecipientCatId: 'companion-cat' }),
  ];
  const lane = findDirectLaneForCat(channels, 'companion-cat');
  assert.equal(lane, null, 'boss_chat room should not be found as direct lane');
  assert.equal(resolveMyCatStatusDot(lane?.defaultRecipientLeaseStatus), 'no_dot');
});

test('clicking My Cats row still preserves existing navigation behavior with status dots', () => {
  const payload = createPayload([
    createChannel({
      id: 'direct-thread-1',
      title: 'Companion',
      defaultRecipientCatId: 'companion-cat',
      roomMode: 'direct_cat_chat',
      defaultRecipientLeaseStatus: 'ready',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);
  const actions: Array<{ kind: 'navigate'; path: string }> = [];

  const tree = createSidebarTree(payload, (catId) => {
    const target = resolveMyCatNavigationTarget(payload.chat.channels, catId);
    actions.push({ kind: 'navigate', path: target.path });
  });
  const myCatsTree = createMyCatsTree(tree);

  const companionButton = findMyCatButton(myCatsTree, 'Companion');
  companionButton.props.onClick?.();

  assert.deepEqual(actions, [{ kind: 'navigate', path: buildMyCatPath('companion-cat') }]);
});

// --- Runtime Footer Status Dot Tests ---

test('no runtime health yet shows gray dot with unknown tooltip', () => {
  const payload = createPayload([], {
    baseUrl: 'http://localhost:3110',
    reachable: undefined as unknown as boolean,
    status: null as unknown as string,
    service: 'cats-runtime',
  });
  const tree = createSidebarTree(payload, () => {});
  assert.equal(readRuntimeFooterLabel(tree), 'Checking Cats Runtime status…');
});

test('reachable healthy runtime shows green dot', () => {
  const payload = createPayload([], createRuntime(true, 'ok'));
  const tree = createSidebarTree(payload, () => {});
  assert.equal(readRuntimeFooterLabel(tree), 'Cats Runtime is connected');
});

test('reachable degraded runtime shows yellow dot', () => {
  const payload = createPayload([], createRuntime(true, 'degraded'));
  const tree = createSidebarTree(payload, () => {});
  assert.equal(readRuntimeFooterLabel(tree), 'Cats Runtime is starting up');
});

test('unreachable runtime shows red dot', () => {
  const payload = createPayload([], createRuntime(false, 'error'));
  const tree = createSidebarTree(payload, () => {});
  assert.equal(readRuntimeFooterLabel(tree), 'Cats Runtime is offline');
});

test('changing selected chat does not affect footer runtime dot', () => {
  const payload = createPayload(
    [createChannel({ id: 'ch-1', title: 'Work' })],
    createRuntime(true, 'ok'),
  );
  const tree = createSidebarTree(payload, () => {});
  assert.equal(readRuntimeFooterLabel(tree), 'Cats Runtime is connected');
});

test('My Cats status dots and footer runtime dot coexist', () => {
  const payload = createPayload(
    [createChannel({
      id: 'dl-1', title: 'Companion', defaultRecipientCatId: 'companion-cat',
      roomMode: 'direct_cat_chat', defaultRecipientLeaseStatus: 'ready',
    } as Partial<ChatChannelSummary> & { id: string; title: string })],
    createRuntime(true, 'ok'),
  );
  const tree = createSidebarTree(payload, () => {});
  assert.equal(readRuntimeFooterLabel(tree), 'Cats Runtime is connected');
});
