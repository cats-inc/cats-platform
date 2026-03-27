import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode, type RefObject } from 'react';

import type { AppShellPayload, ChatChannelSummary } from '../src/products/chat/api/contracts.ts';
import type { ParticipantSessionStatus } from '../src/shared/roomRouting.ts';
import { buildMyCatPath } from '../src/shared/channelPaths.ts';
import { Sidebar } from '../src/products/chat/renderer/components/Sidebar.tsx';
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

function createRuntime(reachable: boolean, status = 'ok') {
  return { baseUrl: 'http://localhost:3110', reachable, status, service: 'cats-runtime' };
}

function createPayload(channels: ChatChannelSummary[], runtime?: { baseUrl: string; reachable: boolean; status: string; service: string }): AppShellPayload {
  return {
    ownerDisplayName: 'Ken',
    setupCompleteAt: '2026-03-23T00:00:00.000Z',
    runtimeReachable: true,
    runtimeBaseUrl: 'http://localhost:8484',
    ...(runtime ? { runtime } : {}),
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
    onDeleteCat: () => {},
    onAccountMenuToggle: () => {},
    onOverflowMenuToggle: () => {},
    onNavigateSettings: () => {},
    onSidebarViewChange: () => {},
    activeMyCatId: null,
    onDirectChatCat,
  });
}

test('clicking a My Cats entry without an existing direct lane opens that Cat lane in place', () => {
  const payload = createPayload([]);
  const actions: Array<{ kind: 'navigate'; path: string }> = [];

  const tree = createSidebarTree(payload, (catId) => {
    const target = resolveMyCatNavigationTarget(payload.chat.channels, catId);
    actions.push({ kind: 'navigate', path: target.path });
  });

  const companionButton = findMyCatButton(tree, 'Companion');
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
      leadCatId: 'companion-cat',
      roomMode: 'direct_cat_chat',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);
  const actions: Array<{ kind: 'navigate'; path: string }> = [];

  const tree = createSidebarTree(payload, (catId) => {
    const target = resolveMyCatNavigationTarget(payload.chat.channels, catId);
    actions.push({ kind: 'navigate', path: target.path });
  });

  const companionButton = findMyCatButton(tree, 'Companion');
  companionButton.props.onClick?.();

  assert.deepEqual(actions, [
    { kind: 'navigate', path: buildMyCatPath('companion-cat') },
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

// --- Status Dot Tests ---

test('Cat with no existing direct lane shows no dot', () => {
  const channels: ChatChannelSummary[] = [];
  const lane = findDirectLaneForCat(channels, 'companion-cat');
  assert.equal(lane, null);
  assert.equal(resolveMyCatStatusDot(lane?.leadParticipantLeaseStatus), 'no_dot');
});

test('Cat with direct lane + ready shows awake (green)', () => {
  const lane = createChannel({
    id: 'dl-1', title: 'C', leadCatId: 'companion-cat', roomMode: 'direct_cat_chat',
    leadParticipantLeaseStatus: 'ready',
  } as Partial<ChatChannelSummary> & { id: string; title: string });
  assert.equal(resolveMyCatStatusDot(lane.leadParticipantLeaseStatus), 'awake');
});

test('Cat with direct lane + initializing shows waking_up (yellow)', () => {
  const lane = createChannel({
    id: 'dl-2', title: 'C', leadCatId: 'companion-cat', roomMode: 'direct_cat_chat',
    leadParticipantLeaseStatus: 'initializing',
  } as Partial<ChatChannelSummary> & { id: string; title: string });
  assert.equal(resolveMyCatStatusDot(lane.leadParticipantLeaseStatus), 'waking_up');
});

test('Cat with direct lane + not_started shows sleeping (gray)', () => {
  const lane = createChannel({
    id: 'dl-3', title: 'C', leadCatId: 'companion-cat', roomMode: 'direct_cat_chat',
    leadParticipantLeaseStatus: 'not_started',
  } as Partial<ChatChannelSummary> & { id: string; title: string });
  assert.equal(resolveMyCatStatusDot(lane.leadParticipantLeaseStatus), 'sleeping');
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
    createChannel({ id: 'boss-room', title: 'Work', leadCatId: 'companion-cat' }),
  ];
  const lane = findDirectLaneForCat(channels, 'companion-cat');
  assert.equal(lane, null, 'boss_chat room should not be found as direct lane');
  assert.equal(resolveMyCatStatusDot(lane?.leadParticipantLeaseStatus), 'no_dot');
});

test('clicking My Cats row still preserves existing navigation behavior with status dots', () => {
  const payload = createPayload([
    createChannel({
      id: 'direct-thread-1',
      title: 'Companion',
      leadCatId: 'companion-cat',
      roomMode: 'direct_cat_chat',
      leadParticipantLeaseStatus: 'ready',
    } as Partial<ChatChannelSummary> & { id: string; title: string }),
  ]);
  const actions: Array<{ kind: 'navigate'; path: string }> = [];

  const tree = createSidebarTree(payload, (catId) => {
    const target = resolveMyCatNavigationTarget(payload.chat.channels, catId);
    actions.push({ kind: 'navigate', path: target.path });
  });

  const companionButton = findMyCatButton(tree, 'Companion');
  companionButton.props.onClick?.();

  assert.deepEqual(actions, [{ kind: 'navigate', path: buildMyCatPath('companion-cat') }]);
});

// --- Runtime Footer Status Dot Tests ---

function findRuntimeDotTitle(node: ReactNode): string | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRuntimeDotTitle(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const cls = typeof node.props.className === 'string' ? node.props.className : '';
  const tooltip = node.props['data-tooltip'] ?? node.props.title;
  if (cls.includes('runtimeStatusDot') && typeof tooltip === 'string') {
    return tooltip;
  }
  const ch = node.props.children;
  if (Array.isArray(ch)) {
    for (const child of ch) {
      const found = findRuntimeDotTitle(child);
      if (found) return found;
    }
  } else if (ch) {
    return findRuntimeDotTitle(ch);
  }
  return null;
}

test('no runtime health yet shows gray dot with unknown tooltip', () => {
  const payload = createPayload([]);
  const tree = createSidebarTree(payload, () => {});
  const title = findRuntimeDotTitle(tree);
  assert.equal(title, 'Cats Runtime status unknown');
});

test('reachable healthy runtime shows green dot', () => {
  const payload = createPayload([], createRuntime(true, 'ok'));
  const tree = createSidebarTree(payload, () => {});
  assert.equal(findRuntimeDotTitle(tree), 'Cats Runtime connected');
});

test('reachable degraded runtime shows yellow dot', () => {
  const payload = createPayload([], createRuntime(true, 'degraded'));
  const tree = createSidebarTree(payload, () => {});
  assert.equal(findRuntimeDotTitle(tree), 'Cats Runtime degraded');
});

test('unreachable runtime shows red dot', () => {
  const payload = createPayload([], createRuntime(false, 'error'));
  const tree = createSidebarTree(payload, () => {});
  assert.equal(findRuntimeDotTitle(tree), 'Cats Runtime unavailable');
});

test('changing selected chat does not affect footer runtime dot', () => {
  const payload = createPayload(
    [createChannel({ id: 'ch-1', title: 'Work' })],
    createRuntime(true, 'ok'),
  );
  const tree = createSidebarTree(payload, () => {});
  assert.equal(findRuntimeDotTitle(tree), 'Cats Runtime connected');
});

test('My Cats status dots and footer runtime dot coexist', () => {
  const payload = createPayload(
    [createChannel({
      id: 'dl-1', title: 'Companion', leadCatId: 'companion-cat',
      roomMode: 'direct_cat_chat', leadParticipantLeaseStatus: 'ready',
    } as Partial<ChatChannelSummary> & { id: string; title: string })],
    createRuntime(true, 'ok'),
  );
  const tree = createSidebarTree(payload, () => {});
  assert.equal(findRuntimeDotTitle(tree), 'Cats Runtime connected');
});
