import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExecutionLabel } from '../dist-server/shared/executionLabel.js';

test('buildExecutionLabel derives backend suffixes from instance instead of rendering the raw instance id', () => {
  assert.equal(
    buildExecutionLabel('claude', 'cli/native', 'claude-opus-4-6'),
    'Claude-CLI · Opus 4.6 with 1M context',
  );
  assert.equal(
    buildExecutionLabel('openclaw', 'agent/gateway', 'openclaw-coder'),
    'OpenClaw-AGENT · openclaw-coder',
  );
  assert.equal(
    buildExecutionLabel('gemini', 'api/flash', 'gemini-3-flash-preview'),
    'Gemini-API · gemini-3-flash-preview',
  );
  assert.equal(
    buildExecutionLabel('ollama', 'local/local', 'qwen2.5-coder:7b'),
    'Ollama-LOCAL · qwen2.5-coder:7b',
  );
});

test('buildExecutionLabel falls back to the product default instance when state has not persisted one yet', () => {
  assert.equal(
    buildExecutionLabel('claude', null, 'claude-opus-4-6'),
    'Claude-CLI · Opus 4.6 with 1M context',
  );
  assert.equal(
    buildExecutionLabel('openclaw', null, 'openclaw-coder'),
    'OpenClaw-AGENT · openclaw-coder',
  );
  assert.equal(
    buildExecutionLabel('gemini', '', 'gemini-3-flash-preview'),
    'Gemini-CLI · gemini-3-flash-preview',
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
    buildExecutionLabel('claude', 'cli/native', 'default'),
    'Claude-CLI · Opus 4.6 with 1M context',
  );
});
