import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearServerLiveTrace,
  pushServerLiveTrace,
} from '../build/server/shared/liveTrace.js';
import { routeChatDebugResourceApi } from '../build/server/products/chat/api/resources/debugRoutes.js';

function createResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

test('routeChatDebugResourceApi returns live trace entries when enabled', async () => {
  clearServerLiveTrace();
  pushServerLiveTrace({
    event: 'stream_target_ready',
    channelId: 'channel-1',
    containerId: 'container-chat-root',
    conversationId: 'conversation-channel-1',
    turnId: 'turn-1',
    laneId: 'lane-1',
    sourceMessageId: 'message-1',
    targetStateId: 'target-1',
    reason: 'active_workflow_running_target',
    signature: 'enabled-trace',
  });

  const response = createResponse();
  const handled = await routeChatDebugResourceApi({
    url: new URL('http://localhost/api/debug/live-trace'),
    method: 'GET',
    response,
    dependencies: {
      config: {
        debugLiveTrace: true,
      },
    },
  });

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.enabled, true);
  assert.equal(payload.entries.length, 1);
  assert.equal(payload.entries[0].event, 'stream_target_ready');
  assert.equal(payload.entries[0].containerId, 'container-chat-root');
  assert.equal(payload.entries[0].conversationId, 'conversation-channel-1');
  assert.equal(payload.entries[0].turnId, 'turn-1');
  assert.equal(payload.entries[0].laneId, 'lane-1');
  assert.equal(payload.entries[0].sourceMessageId, 'message-1');
  assert.equal(payload.entries[0].targetStateId, 'target-1');
});

test('routeChatDebugResourceApi reports disabled tracing when the env flag is off', async () => {
  const response = createResponse();
  const handled = await routeChatDebugResourceApi({
    url: new URL('http://localhost/api/debug/live-trace'),
    method: 'GET',
    response,
    dependencies: {
      config: {
        debugLiveTrace: false,
      },
    },
  });

  assert.equal(handled, true);
  assert.equal(response.statusCode, 404);
  assert.equal(JSON.parse(response.body).error, 'live_trace_disabled');
});

test('routeChatDebugResourceApi does not handle retired origin-surface compatibility telemetry', async () => {
  const response = createResponse();
  const handled = await routeChatDebugResourceApi({
    url: new URL('http://localhost/api/debug/origin-surface-compatibility'),
    method: 'GET',
    response,
    dependencies: {
      config: {
        debugLiveTrace: false,
      },
    },
  });

  assert.equal(handled, false);
  assert.equal(response.statusCode, null);
});
