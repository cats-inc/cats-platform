import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode, type RefObject } from 'react';

import { AccountIdentityMenu } from '../src/design/components/AccountIdentityMenu.tsx';
import { PlatformSurfaceSwitcher } from '../src/design/components/PlatformSurfaceSwitcher.tsx';
import { Sidebar as WorkSidebar } from '../src/products/work/renderer/components/Sidebar.tsx';
import { Sidebar as CodeSidebar } from '../src/products/code/renderer/components/Sidebar.tsx';
import type { AppShellPayload as WorkAppShellPayload } from '../src/products/work/api/contracts.ts';
import type { AppShellPayload as CodeAppShellPayload } from '../src/products/code/api/contracts.ts';
import type { PlatformSurfaceId } from '../src/shared/platform-contract.ts';

function matchesComponent(
  node: ReactNode,
  component: (props: Record<string, unknown>) => ReactNode,
): boolean {
  if (!isValidElement(node)) {
    return false;
  }

  if (node.type === component) {
    return true;
  }

  return typeof node.type !== 'string' && node.type?.name === component.name;
}

function createPayload(): WorkAppShellPayload {
  return {
    app: {
      name: 'cats-platform',
      stage: 'phase-2-shell',
      runtimeBoundary: 'cats-runtime',
    },
    products: [],
    desktop: {
      startAtLogin: false,
      openWindowOnStartup: true,
      systemTrayEnabled: true,
    },
    lobby: {
      animationMode: 'reduced',
      cats: [],
    },
    runtime: {
      baseUrl: 'http://localhost:8484',
      reachable: true,
      status: 'ok',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      state: 'ready',
      runtimePath: null,
      configuredAt: null,
      detectedAt: null,
      notes: [],
    },
    metadata: {
      generatedAt: '2026-04-07T00:00:00.000Z',
      host: 'localhost',
      port: 8484,
    },
    bootstrapAttemptId: null,
    setupCompleteAt: '2026-04-07T00:00:00.000Z',
    ownerDisplayName: 'Ken',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    lastProductSurface: 'work',
    guideCat: null,
    guideCatSidecarSeen: true,
    assistantPresets: [],
    chat: {
      id: 'chat',
      name: 'Cats Chat',
      selectedChannelId: '',
      bossCatId: 'boss-cat',
      cats: [
        {
          id: 'boss-cat',
          name: 'Boss Cat',
          roles: [],
          skillProfile: null,
          mcpProfile: null,
          status: 'active',
          createdAt: '2026-04-07T00:00:00.000Z',
          updatedAt: '2026-04-07T00:00:00.000Z',
          archivedAt: null,
          avatarColor: '#8B7E74',
          avatarUrl: null,
          defaultExecutionTarget: { provider: 'claude', instance: null, model: 'claude-sonnet-4' },
          defaultModelSelection: null,
          products: ['chat'],
          memory: { summary: null, updatedAt: null },
        },
      ],
      channels: [],
      selectedChannel: null,
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
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
      newChatDefaults: {
        provider: 'claude',
        instance: null,
        model: 'claude-sonnet-4',
        modelSelection: null,
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
        availableSurfaces: ['chat', 'work', 'code'],
      },
      showVerboseMessages: false,
      botBindings: [],
    },
  };
}

function findSurfaceSwitcherActiveSurface(node: ReactNode): PlatformSurfaceId {
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return findSurfaceSwitcherActiveSurface(child);
      } catch {
        continue;
      }
    }
    throw new Error('PlatformSurfaceSwitcher not found.');
  }

  if (!isValidElement(node)) {
    throw new Error('PlatformSurfaceSwitcher not found.');
  }

  if (matchesComponent(node, PlatformSurfaceSwitcher)) {
    return node.props.activeSurface as PlatformSurfaceId;
  }

  return findSurfaceSwitcherActiveSurface(node.props.children);
}

function findAccountIdentityMenu(
  node: ReactNode,
): { props: { open?: boolean; menuWidth?: string } } {
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

  if (matchesComponent(node, AccountIdentityMenu)) {
    return node as { props: { open?: boolean; menuWidth?: string } };
  }

  return findAccountIdentityMenu(node.props.children);
}

function withLocationPathname(pathname: string, run: () => void): void {
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { pathname },
  });

  try {
    run();
  } finally {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: originalLocation,
    });
  }
}

test('Work sidebar keeps the Work product selected on platform settings routes', () => {
  withLocationPathname('/settings/general', () => {
    const tree = WorkSidebar({
      payload: createPayload(),
      sidebarOpen: true,
      accountMenuOpen: false,
      overflowMenuOpenId: null,
      busy: '',
      surface: 'settings',
      shellSurface: 'work',
      routeChannelId: null,
      accountMenuRef: { current: null } as RefObject<HTMLDivElement>,
      onToggleSidebar: () => {},
      onCollapsedSidebarClick: () => {},
      onOpenChatsOverview: () => {},
      onStartNewChat: () => {},
      onStartWorkIntake: () => {},
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

    assert.equal(findSurfaceSwitcherActiveSurface(tree), 'work');
  });
});

test('Code sidebar keeps the Code product selected on platform settings routes', () => {
  withLocationPathname('/settings/general', () => {
    const tree = CodeSidebar({
      payload: createPayload() as unknown as CodeAppShellPayload,
      sidebarOpen: true,
      accountMenuOpen: false,
      overflowMenuOpenId: null,
      busy: '',
      surface: 'settings',
      shellSurface: 'code',
      routeChannelId: null,
      accountMenuRef: { current: null } as RefObject<HTMLDivElement>,
      onToggleSidebar: () => {},
      onCollapsedSidebarClick: () => {},
      onOpenChatsOverview: () => {},
      onStartNewChat: () => {},
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
      onOpenBuild: () => {},
      onOpenRelay: () => {},
    });

    assert.equal(findSurfaceSwitcherActiveSurface(tree), 'code');
  });
});

test('Work and Code sidebars keep the shared environment account menu wiring', () => {
  const workTree = WorkSidebar({
    payload: createPayload(),
    sidebarOpen: true,
    accountMenuOpen: true,
    overflowMenuOpenId: null,
    busy: '',
    surface: 'chats',
    shellSurface: 'work',
    routeChannelId: null,
    accountMenuRef: { current: null } as RefObject<HTMLDivElement>,
    onToggleSidebar: () => {},
    onCollapsedSidebarClick: () => {},
    onOpenChatsOverview: () => {},
    onStartNewChat: () => {},
    onStartWorkIntake: () => {},
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

  const codeTree = CodeSidebar({
    payload: createPayload() as unknown as CodeAppShellPayload,
    sidebarOpen: true,
    accountMenuOpen: true,
    overflowMenuOpenId: null,
    busy: '',
    surface: 'chats',
    shellSurface: 'code',
    routeChannelId: null,
    accountMenuRef: { current: null } as RefObject<HTMLDivElement>,
    onToggleSidebar: () => {},
    onCollapsedSidebarClick: () => {},
    onOpenChatsOverview: () => {},
    onStartNewChat: () => {},
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
    onOpenBuild: () => {},
    onOpenRelay: () => {},
  });

  const workAccountMenu = findAccountIdentityMenu(workTree);
  const codeAccountMenu = findAccountIdentityMenu(codeTree);

  assert.equal(workAccountMenu.props.open, true);
  assert.equal(workAccountMenu.props.menuWidth, 'trigger');

  assert.equal(codeAccountMenu.props.open, true);
  assert.equal(codeAccountMenu.props.menuWidth, 'trigger');
});
