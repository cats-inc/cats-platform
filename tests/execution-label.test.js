import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCatExecutionLabel,
  buildExecutionLabel,
  clearRememberedExecutionLabels,
  rememberExecutionLabel,
} from '../build/server/shared/executionLabel.js';

test('buildExecutionLabel derives backend suffixes from instance instead of rendering the raw instance id', () => {
  assert.equal(
    buildExecutionLabel('claude', 'cli/native', 'claude-opus-4-6'),
    'Claude-CLI · Opus 4.7 with 1M context',
  );
  assert.equal(
    buildExecutionLabel('openclaw', 'agent/gateway', 'openclaw-coder'),
    'OpenClaw-AGENT · openclaw-coder',
  );
  assert.equal(
    buildExecutionLabel('antigravity', 'api/flash', 'Gemini 3 Flash'),
    'Antigravity-API · Gemini 3 Flash',
  );
  assert.equal(
    buildExecutionLabel('ollama', 'local/local', 'qwen2.5-coder:7b'),
    'Ollama-LOCAL · qwen2.5-coder:7b',
  );
});

test('buildExecutionLabel falls back to the product default instance when state has not persisted one yet', () => {
  assert.equal(
    buildExecutionLabel('claude', null, 'claude-opus-4-6'),
    'Claude-CLI · Opus 4.7 with 1M context',
  );
  assert.equal(
    buildExecutionLabel('openclaw', null, 'openclaw-coder'),
    'OpenClaw-AGENT · openclaw-coder',
  );
  assert.equal(
    buildExecutionLabel('antigravity', '', 'Gemini 3 Flash'),
    'Antigravity-CLI · Gemini 3 Flash',
  );
});

test('buildExecutionLabel treats runtime canonical default instances as backend aliases', () => {
  assert.equal(
    buildExecutionLabel('claude', 'default', 'claude-opus-4-6'),
    'Claude-CLI · Opus 4.7 with 1M context',
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

test('buildExecutionLabel resolves Claude native aliases to friendly model names', () => {
  assert.equal(
    buildExecutionLabel('claude', 'cli/native', 'opus'),
    'Claude-CLI · Opus 4.7 with 1M context',
  );
  assert.equal(
    buildExecutionLabel('claude', 'cli/native', 'claude-opus-4-6'),
    'Claude-CLI · Opus 4.7 with 1M context',
  );
});

test('buildExecutionLabel does not treat default as a Claude opus alias', () => {
  assert.equal(
    buildExecutionLabel('claude', 'cli/native', 'default'),
    'Claude-CLI · default',
  );
});

test('buildCatExecutionLabel reuses remembered runtime-backed labels for matching targets', () => {
  clearRememberedExecutionLabels();
  rememberExecutionLabel({
    provider: 'claude',
    instance: 'cli/native',
    model: 'opus',
    modelSelection: {
      controls: {
        'claude.reasoning_effort': 'xhigh',
      },
    },
    executionLabel: 'Claude-CLI · Opus 4.7 with 1M context · xHigh',
  });

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
    'Claude-CLI · Opus 4.7 with 1M context · xHigh',
  );

  clearRememberedExecutionLabels();
});
