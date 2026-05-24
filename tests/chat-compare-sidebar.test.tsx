import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import React, { type ComponentProps, type RefObject } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { GuideCatPlacementProvider } from '../src/app/renderer/GuideCatPlacementProvider.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import type { AppShellPayload, ChatChannelSummary } from '../src/products/chat/api/contracts.ts';
import {
  buildNewGroupChatPath,
  buildNewParallelChatPath,
  readNewChatPreset,
} from '../src/products/chat/shared/channelPaths.ts';
import { Sidebar } from '../src/products/chat/renderer/components/Sidebar.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

type SidebarProps = ComponentProps<typeof Sidebar>;

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
          originSurface: 'chat',
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

function createSidebarProps(overrides: Partial<SidebarProps> = {}): SidebarProps {
  return {
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
    onNavigateRuntime: () => {},
    onCreateNewCat: () => {},
    onSwitchProduct: () => {},
    activeMyCatId: null,
    onDirectChatCat: () => {},
    onClearDirectLane: () => {},
    confirmDialog: async () => true,
    ...overrides,
  };
}

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  return render(
    <MemoryRouter initialEntries={['/chat/chats/compare-1']}>
      <I18nProvider locale="en">
        <GuideCatPlacementProvider
          guideCat={null}
          placement="floating"
          floatingAnchor={null}
          sidecarMode="auto"
          onPersistSeen={() => {}}
          onCommit={() => {}}
        >
          <Sidebar {...createSidebarProps(overrides)} />
        </GuideCatPlacementProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

function installDom(): () => void {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/chat/chats/compare-1',
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'attachEvent', {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'detachEvent', {
    configurable: true,
    value: () => {},
  });
  const previousDescriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();
  const globals: Array<[PropertyKey, unknown]> = [
    ['React', React],
    ['window', dom.window],
    ['document', dom.window.document],
    ['location', dom.window.location],
    ['HTMLElement', dom.window.HTMLElement],
    ['HTMLButtonElement', dom.window.HTMLButtonElement],
    ['SVGElement', dom.window.SVGElement],
    ['DocumentFragment', dom.window.DocumentFragment],
    ['Node', dom.window.Node],
    ['Event', dom.window.Event],
    ['MouseEvent', dom.window.MouseEvent],
    ['MutationObserver', dom.window.MutationObserver],
    ['navigator', dom.window.navigator],
    ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
  ];
  for (const [key, value] of globals) {
    previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
  return () => {
    for (const [key, descriptor] of previousDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete (globalThis as Record<PropertyKey, unknown>)[key];
      }
    }
    dom.window.close();
  };
}

function readPrimaryActionLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.sidebarInner > .navGroup .navLabel'))
    .map((node) => node.textContent ?? '');
}

test('Sidebar groups parallel chats and shows member labels in Recents', (t) => {
  const restoreDom = installDom();
  t.after(() => {
    cleanup();
    restoreDom();
  });
  const view = renderSidebar();

  assert.deepEqual(
    readPrimaryActionLabels(view.container),
    ['New Chat', 'Group Chat', 'Parallel Chat'],
  );
  assert.ok(view.getByText('Parallel chat 1'));
  assert.ok(view.getByText('Claude Sonnet 4'));
  assert.ok(view.getByText('GPT-5'));
});

test('Sidebar exposes a dedicated Group chat primary action', (t) => {
  const restoreDom = installDom();
  t.after(() => {
    cleanup();
    restoreDom();
  });
  const actions: string[] = [];
  const view = renderSidebar({
    onStartNewChat: () => {
      actions.push('default');
    },
    onStartNewGroupChat: () => {
      actions.push('group');
    },
    onStartNewParallelChat: () => {
      actions.push('parallel');
    },
  });

  fireEvent.click(view.getByRole('button', { name: 'Group Chat' }));
  assert.deepEqual(actions, ['group']);
});

test('Sidebar excludes non-chat recents and compare groups by origin surface', (t) => {
  const restoreDom = installDom();
  t.after(() => {
    cleanup();
    restoreDom();
  });
  const payload = createPayload();
  payload.chat.channels = [
    createChannel({ id: 'chat-1', title: 'Chat recent' }),
    createChannel({ id: 'code-1', title: 'Code recent', originSurface: 'code' }),
    createChannel({ id: 'compare-chat-1', title: 'Compare chat A' }),
    createChannel({ id: 'compare-chat-2', title: 'Compare chat B' }),
    createChannel({ id: 'compare-code-1', title: 'Compare code A', originSurface: 'code' }),
    createChannel({ id: 'compare-code-2', title: 'Compare code B', originSurface: 'code' }),
  ];
  payload.chat.parallelChatGroups = [
    {
      id: 'chat-group',
      title: 'Chat compare',
      originSurface: 'chat',
      mode: 'compare',
      status: 'active',
      memberCount: 2,
      memberChannelIds: ['compare-chat-1', 'compare-chat-2'],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      lastMessageAt: '2026-04-01T00:05:00.000Z',
      members: [],
    },
    {
      id: 'code-group',
      title: 'Code compare',
      originSurface: 'code',
      mode: 'compare',
      status: 'active',
      memberCount: 2,
      memberChannelIds: ['compare-code-1', 'compare-code-2'],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      lastMessageAt: '2026-04-01T00:05:00.000Z',
      members: [],
    },
  ];

  const view = renderSidebar({
    payload,
    routeChannelId: 'chat-1',
  });

  assert.ok(view.getByText('Chat recent'));
  assert.ok(view.getByText('Chat compare'));
  assert.equal(view.queryByText('Code recent'), null);
  assert.equal(view.queryByText('Code compare'), null);
  assert.equal(view.queryByText('Compare code A'), null);
  assert.equal(view.queryByText('Compare code B'), null);
});

test('Sidebar footer exposes two sibling buttons for settings and runtime navigation', (t) => {
  const restoreDom = installDom();
  t.after(() => {
    cleanup();
    restoreDom();
  });
  // Temporary variant of the account-menu test while the popup menu is
  // disabled. Two real <button> siblings (main + trailing) so keyboard
  // users Tab to the runtime entry independently and Enter/Space
  // activates it natively — no click-target detection, no nested
  // interactives. When the popup returns (see preservation block in
  // ConversationSidebarFooter.tsx), flip this back to asserting the
  // <AccountIdentityMenu> wiring.
  let navigateSettingsCount = 0;
  let navigateRuntimeCount = 0;

  const view = renderSidebar({
    accountMenuOpen: true,
    onNavigateSettings: () => {
      navigateSettingsCount += 1;
    },
    onNavigateRuntime: () => {
      navigateRuntimeCount += 1;
    },
  });

  // Both halves must be real <button>s so they participate in the
  // browser's native focus/activation chain (no role="button" <span>s,
  // no `tabIndex={0}` workarounds).
  const mainButton = view.container.querySelector<HTMLButtonElement>('.sidebarFooterMainButton');
  const trailingButton = view.container.querySelector<HTMLButtonElement>('.sidebarFooterTrailing');
  assert.ok(mainButton);
  assert.ok(trailingButton);
  assert.equal(mainButton.tagName, 'BUTTON');
  assert.equal(trailingButton.tagName, 'BUTTON');
  assert.match(trailingButton.getAttribute('aria-label') ?? '', /Runtime status/);

  // Activating the main button (keyboard Enter/Space or mouse click —
  // the browser funnels both into `onClick`) navigates to general
  // settings.
  fireEvent.click(mainButton);
  assert.equal(navigateSettingsCount, 1);
  assert.equal(navigateRuntimeCount, 0);

  // Activating the trailing button (independent Tab stop) navigates
  // to runtime settings.
  fireEvent.click(trailingButton);
  assert.equal(navigateSettingsCount, 1);
  assert.equal(navigateRuntimeCount, 1);
});

test('new-chat route helpers keep group and parallel entry intents explicit', () => {
  assert.equal(buildNewGroupChatPath(), '/chat/new?preset=group');
  assert.equal(buildNewParallelChatPath(), '/chat/new?preset=parallel');
  assert.equal(readNewChatPreset('?preset=group'), 'group');
  assert.equal(readNewChatPreset('?preset=parallel'), 'parallel');
  assert.equal(readNewChatPreset('?preset=compare'), 'default');
  assert.equal(readNewChatPreset(''), 'default');
});
