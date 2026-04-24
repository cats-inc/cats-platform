import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const HOOKS_DIR = path.join(
  process.cwd(),
  'src',
  'products',
  'shared',
  'renderer',
  'hooks',
);
const COMPONENTS_DIR = path.join(
  process.cwd(),
  'src',
  'products',
  'shared',
  'renderer',
  'components',
);

test('useVoiceInputComposer cancels recognition when disabled flips true', async () => {
  const source = await readFile(
    path.join(HOOKS_DIR, 'useVoiceInputComposer.ts'),
    'utf8',
  );

  assert.match(source, /disabled\?:\s*boolean/u);
  assert.match(source, /if \(disabled && listening\) cancel\(\);/u);
  assert.doesNotMatch(source, /if \(disabled && listening\) stop\(\);/u);
  assert.match(source, /useWebSpeechInput\(/u);
});

test('useVoiceInputComposer falls back to append when textarea selection is untrusted', async () => {
  const source = await readFile(
    path.join(HOOKS_DIR, 'useVoiceInputComposer.ts'),
    'utf8',
  );

  assert.match(source, /hasUserSelectionRef/u);
  assert.match(source, /document\.activeElement === el/u);
  assert.match(source, /addEventListener\(['"]focus['"]/u);
  assert.match(source, /selectionIsTrustworthy/u);
});

test('useWebSpeechInput cancel aborts and invalidates stale recognition callbacks', async () => {
  const source = await readFile(
    path.join(HOOKS_DIR, 'useWebSpeechInput.ts'),
    'utf8',
  );

  assert.match(source, /cancel:\s*\(\) => void/u);
  assert.match(source, /sessionTokenRef\.current \+= 1/u);
  assert.match(source, /recognition\.abort\(\)/u);
  assert.match(source, /if \(!isCurrentSession\(\)\) return;\s*let finalText/u);
  assert.match(source, /return \{ supported, listening, start, stop, cancel \};/u);
});

test('composer entry points route voice input through useVoiceInputComposer', async () => {
  const entries = [
    path.join(COMPONENTS_DIR, 'chat-view', 'ChatComposerArea.tsx'),
    path.join(COMPONENTS_DIR, 'NewChatDraft.tsx'),
    path.join(COMPONENTS_DIR, 'ChatNewChatDraft.tsx'),
  ];
  for (const file of entries) {
    const source = await readFile(file, 'utf8');
    assert.match(
      source,
      /useVoiceInputComposer/u,
      `${path.basename(file)} must import useVoiceInputComposer`,
    );
    assert.match(
      source,
      /voiceInputSupported\s*\?/u,
      `${path.basename(file)} must gate the mic button on voiceInputSupported`,
    );
  }
});
