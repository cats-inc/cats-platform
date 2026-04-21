import assert from 'node:assert/strict';
import test from 'node:test';
import React, { type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { ChatComposerArea } from '../src/products/shared/renderer/components/chat-view/ChatComposerArea.tsx';
import {
  createScreenshotFilename,
  resolveScreenshotCaptureRoute,
} from '../src/products/shared/renderer/screenshotCapture.ts';

type ChatComposerAreaRenderProps = ComponentProps<typeof ChatComposerArea>;

function createPayload(): AppShellPayload {
  return {
    chat: {
      bossCatId: null,
      cats: [],
      capabilities: {
        maxAudienceParticipants: 3,
      },
    },
  } as unknown as AppShellPayload;
}

function createComposerProps(
  overrides: Partial<ChatComposerAreaRenderProps> = {},
): ChatComposerAreaRenderProps {
  return {
    hasConversationStarted: true,
    isCompareGroup: false,
    isNearBottom: true,
    payload: createPayload(),
    composerDraft: '',
    channelFiles: [],
    channelPlusMenuOpen: false,
    channelPlusMenuRef: { current: null },
    channelFileInputRef: { current: null },
    composerBusy: false,
    compareBusy: false,
    stopBusy: false,
    composerWorkspacePath: null,
    directLaneExcludedMentionNames: [],
    composerRecipients: [
      {
        kind: 'implicit',
        name: 'Claude-CLI',
        provider: 'claude',
        instance: 'cli',
        model: 'opus',
      },
    ],
    defaultRecipientParticipantId: null,
    composerStackParticipants: [],
    isDirectLane: false,
    isSoloComposer: true,
    activeWorkflowShape: 'sequential',
    onToggleActiveWorkflowShape: () => {},
    activeAudienceKeys: null,
    onSetActiveAudienceKeys: () => {},
    compareSendScope: 'all_members',
    showCancelComposerAction: false,
    showStopComposerAction: false,
    composerCardRef: () => {},
    onOpenSection: () => {},
    onComposerChange: () => {},
    onComposerKeyDown: () => {},
    onSendMessage: () => {},
    onToggleChannelPlusMenu: () => {},
    onChannelFileSelect: () => {},
    onChannelFilesChange: () => {},
    onScrollToBottom: () => {},
    autoResize: () => {},
    ...overrides,
  };
}

test('chat composer shows the screenshot attachment action when wired', () => {
  const markup = renderToStaticMarkup(
    <ChatComposerArea
      {...createComposerProps({
        channelPlusMenuOpen: true,
        onTakeScreenshot: () => {},
        screenshotCaptureTooltip: 'Capture a screen, window, or tab',
      })}
    />,
  );

  assert.match(markup, /Add photos and files/u);
  assert.match(markup, /Take screenshot/u);
  assert.match(
    markup,
    /<button class="composerPlusMenuItem" type="button" data-tooltip="Capture a screen, window, or tab"[^>]*>[\s\S]*Take screenshot/u,
  );
});

test('chat composer can send an attachment-only screenshot draft', () => {
  const markup = renderToStaticMarkup(
    <ChatComposerArea
      {...createComposerProps({
        composerDraft: '   ',
        channelFiles: [
          new File(['png'], 'cats-screenshot-20260422-010203-001.png', {
            type: 'image/png',
          }),
        ],
      })}
    />,
  );
  const sendButton = markup.match(/<button class="composerSendButton"[^>]*aria-label="Send"[^>]*>/u);

  assert.ok(sendButton);
  assert.doesNotMatch(sendButton[0], /disabled/u);
});

test('screenshot filenames remain unique within the same second', () => {
  const now = new Date(2026, 3, 22, 1, 2, 3);

  assert.equal(createScreenshotFilename(now), 'cats-screenshot-20260422-010203-001.png');
  assert.equal(createScreenshotFilename(now), 'cats-screenshot-20260422-010203-002.png');
});

test('screenshot routing requires explicit native desktop capability', () => {
  const hostGlobal = globalThis as typeof globalThis & {
    catsDesktopHost?: unknown;
  };
  const previous = hostGlobal.catsDesktopHost;

  try {
    hostGlobal.catsDesktopHost = {
      screenshotRegionCaptureAvailable: false,
      captureScreenshotRegion: async () => ({
        outcome: 'platform_unsupported',
      }),
    };
    assert.equal(resolveScreenshotCaptureRoute(), 'unavailable');

    hostGlobal.catsDesktopHost = {
      screenshotRegionCaptureAvailable: true,
      captureScreenshotRegion: async () => ({
        outcome: 'cancelled',
      }),
    };
    assert.equal(resolveScreenshotCaptureRoute(), 'desktop_region');
  } finally {
    if (previous === undefined) {
      delete hostGlobal.catsDesktopHost;
    } else {
      hostGlobal.catsDesktopHost = previous;
    }
  }
});
