import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactNode, type RefObject } from 'react';

import { AccountIdentityMenu } from '../src/design/components/AccountIdentityMenu.tsx';
import { PlatformSurfaceSwitcher } from '../src/design/components/PlatformSurfaceSwitcher.tsx';
import { ConversationSidebarFooter } from '../src/app/renderer/productShell/ConversationSidebarFooter.tsx';
import { ConversationSidebarNavigation } from '../src/app/renderer/productShell/ConversationSidebarNavigation.tsx';
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
        maxChatParticipants: 5,
        maxAudienceParticipants: 3,
        maxParallelChats: 5,
        availableSurfaces: ['chat', 'work', 'code'],
      },
      showVerboseMessages: false,
      botBindings: [],
    },
  };
}

function findElementByComponent(
  node: ReactNode,
  component: (props: Record<string, unknown>) => ReactNode,
) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByComponent(child, component);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  if (matchesComponent(node, component)) {
    return node as { props: Record<string, unknown> };
  }

  return findElementByComponent(node.props.children, component);
}

function findSurfaceSwitcherActiveSurface(node: ReactNode): PlatformSurfaceId {
  const navigation = findElementByComponent(node, ConversationSidebarNavigation);
  if (!navigation) {
    throw new Error('ConversationSidebarNavigation not found.');
  }

  const navigationTree = ConversationSidebarNavigation(
    navigation.props as Parameters<typeof ConversationSidebarNavigation>[0],
  );
  const switcher = findElementByComponent(navigationTree, PlatformSurfaceSwitcher);
  if (!switcher) {
    throw new Error('PlatformSurfaceSwitcher not found.');
  }

  return switcher.props.activeSurface as PlatformSurfaceId;
}

function findAccountIdentityMenu(
  node: ReactNode,
): { props: { open?: boolean; menuWidth?: string } } {
  const footer = findElementByComponent(node, ConversationSidebarFooter);
  if (!footer) {
    throw new Error('ConversationSidebarFooter not found.');
  }

  const footerTree = ConversationSidebarFooter(
    footer.props as Parameters<typeof ConversationSidebarFooter>[0],
  );
  const accountMenu = findElementByComponent(footerTree, AccountIdentityMenu);
  if (!accountMenu) {
    throw new Error('AccountIdentityMenu not found.');
  }

  return accountMenu as { props: { open?: boolean; menuWidth?: string } };
}

function flattenText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => flattenText(child)).join('');
  }

  if (!isValidElement(node)) {
    return '';
  }

  return flattenText(node.props.children);
}

function findButtonClassByLabel(node: ReactNode, label: string): string {
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return findButtonClassByLabel(child, label);
      } catch {
        continue;
      }
    }
    throw new Error(`Button "${label}" not found.`);
  }

  if (!isValidElement(node)) {
    throw new Error(`Button "${label}" not found.`);
  }

  if (node.type === 'button' && flattenText(node.props.children).includes(label)) {
    return node.props.className as string;
  }

  const children = node.props.children;

  if (Array.isArray(children)) {
    for (const child of children) {
      try {
        return findButtonClassByLabel(child, label);
      } catch {
        continue;
      }
    }
  } else if (children !== undefined) {
    return findButtonClassByLabel(children, label);
  }

  throw new Error(`Button "${label}" not found.`);
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
      onOpenWarRoom: () => {},
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

test('Work sidebar marks War Room active for operational task routes', () => {
  withLocationPathname('/work/tasks/task-123', () => {
    const tree = WorkSidebar({
      payload: createPayload(),
      sidebarOpen: true,
      accountMenuOpen: false,
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
      onOpenWarRoom: () => {},
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

    assert.match(findButtonClassByLabel(tree, 'War Room'), /navItemActive/u);
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
    onOpenWarRoom: () => {},
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
