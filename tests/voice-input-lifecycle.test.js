import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('voice input cancels recognition when composer becomes busy', async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      'src',
      'products',
      'shared',
      'renderer',
      'components',
      'chat-view',
      'ChatComposerArea.tsx',
    ),
    'utf8',
  );

  assert.match(source, /cancel:\s*cancelVoiceInput/u);
  assert.match(source, /if \(composerBusy && voiceInputListening\) cancelVoiceInput\(\);/u);
  assert.doesNotMatch(
    source,
    /if \(composerBusy && voiceInputListening\) stopVoiceInput\(\);/u,
  );
});

test('voice input cancel aborts and invalidates stale recognition callbacks', async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      'src',
      'products',
      'shared',
      'renderer',
      'hooks',
      'useWebSpeechInput.ts',
    ),
    'utf8',
  );

  assert.match(source, /cancel:\s*\(\) => void/u);
  assert.match(source, /sessionTokenRef\.current \+= 1/u);
  assert.match(source, /recognition\.abort\(\)/u);
  assert.match(source, /if \(!isCurrentSession\(\)\) return;\s*let finalText/u);
  assert.match(source, /return \{ supported, listening, start, stop, cancel \};/u);
});
