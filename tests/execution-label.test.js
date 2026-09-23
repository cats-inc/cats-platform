import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCatExecutionLabel,
  buildExecutionLabel,
} from '../build/server/shared/executionLabel.js';

test('buildExecutionLabel derives backend suffixes from instance instead of rendering the raw instance id', () => {
  assert.equal(
    buildExecutionLabel('claude', 'cli/native', 'claude-opus-4-6'),
    'Claude-CLI · claude-opus-4-6',
  );
  assert.equal(
    buildExecutionLabel('openclaw', 'agent/gateway', 'openclaw-coder'),
    'OpenClaw-AGENT · openclaw-coder',
  );
  assert.equal(
    buildExecutionLabel('codex', 'api/main', 'gpt-5.4'),
    'Codex-API · gpt-5.4',
  );
  assert.equal(
    buildExecutionLabel('ollama', 'local/local', 'qwen2.5-coder:7b'),
    'Ollama-LOCAL · qwen2.5-coder:7b',
  );
});

test('buildExecutionLabel falls back to the product default instance when state has not persisted one yet', () => {
  assert.equal(
    buildExecutionLabel('claude', null, 'claude-opus-4-6'),
    'Claude-CLI · claude-opus-4-6',
  );
  assert.equal(
    buildExecutionLabel('openclaw', null, 'openclaw-coder'),
    'OpenClaw-AGENT · openclaw-coder',
  );
  assert.equal(
    buildExecutionLabel('antigravity', '', 'gemini-3.8-flash-low'),
    'Antigravity-CLI · gemini-3.8-flash-low',
  );
});

test('buildExecutionLabel normalizes target-level CLI provider ids', () => {
  assert.equal(
    buildExecutionLabel('antigravity-cli', null, 'gemini-3.8-flash-low'),
    'Antigravity-CLI · gemini-3.8-flash-low',
  );
});

test('buildExecutionLabel treats runtime canonical default instances as backend aliases', () => {
  assert.equal(
    buildExecutionLabel('claude', 'default', 'claude-opus-4-6'),
    'Claude-CLI · claude-opus-4-6',
  );
  assert.equal(
    buildExecutionLabel('kiro', 'default', 'claude-opus-4.6'),
    'Kiro-CLI · claude-opus-4.6',
  );
  assert.equal(
    buildExecutionLabel('openclaw', 'default', 'openclaw-coder'),
    'OpenClaw-AGENT · openclaw-coder',
  );
});

test('buildExecutionLabel does not render raw instance identifiers in the chip label', () => {
  assert.doesNotMatch(
    buildExecutionLabel('claude', 'cli/native', 'claude-opus-4-6'),
    /cli\/native|agent\/gateway|api\/flash/u,
  );
});

test('buildExecutionLabel preserves raw IDs before a scoped label is observed', () => {
  assert.equal(
    buildExecutionLabel('claude', 'cli/native', 'opus'),
    'Claude-CLI · opus',
  );
  assert.equal(
    buildExecutionLabel('claude', 'cli/native', 'claude-opus-4-6'),
    'Claude-CLI · claude-opus-4-6',
  );
});

test('buildExecutionLabel does not treat default as a Claude opus alias', () => {
  assert.equal(
    buildExecutionLabel('claude', 'cli/native', 'default'),
    'Claude-CLI · default',
  );
});

test('buildCatExecutionLabel does not reuse another session’s remembered label', () => {
  assert.equal(buildCatExecutionLabel({
    defaultExecutionTarget: { provider: 'claude', instance: 'cli/native', model: 'opus' },
    executionLabel: 'Saved historical model label',
  }), 'Saved historical model label');

  assert.equal(
    buildCatExecutionLabel({
      defaultExecutionTarget: {
        provider: 'claude',
        instance: 'cli/native',
        model: 'opus',
      },
      defaultModelSelection: {
        controls: {
          'claude.reasoning_effort': 'xhigh',
        },
      },
    }),
    'Claude-CLI · opus · xhigh',
  );

});
