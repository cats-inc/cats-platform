import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('macOS STT helper enforces on-device recognition and typed bridge events', async () => {
  const source = await readFile(
    join(
      process.cwd(),
      'desktop',
      'native',
      'macos-stt',
      'Sources',
      'CatsSttMacos',
      'main.swift',
    ),
    'utf8',
  );

  assert.match(source, /import Speech/u);
  assert.match(source, /supportsOnDeviceRecognition/u);
  assert.match(source, /requiresOnDeviceRecognition = true/u);
  assert.match(source, /"mode": "on-device"/u);
  assert.match(source, /"language_not_supported"/u);
  assert.match(source, /"permission_denied"/u);
  assert.match(source, /"permission_not_determined"/u);
  assert.match(source, /SFSpeechURLRecognitionRequest/u);
  assert.match(source, /SFSpeechAudioBufferRecognitionRequest/u);
  assert.match(source, /options\.inputPath == nil/u);
});

test('Windows STT helper uses WinRT speech and reports unknown locality', async () => {
  const source = await readFile(
    join(process.cwd(), 'desktop', 'native', 'windows-stt', 'Program.cs'),
    'utf8',
  );
  const project = await readFile(
    join(process.cwd(), 'desktop', 'native', 'windows-stt', 'CatsSttWindows.csproj'),
    'utf8',
  );

  assert.match(project, /net8\.0-windows10\.0\.19041\.0/u);
  assert.match(source, /Windows\.Media\.SpeechRecognition/u);
  assert.match(source, /ContinuousRecognitionSession/u);
  assert.match(source, /HypothesisGenerated/u);
  assert.match(source, /ResultGenerated/u);
  assert.match(source, /"mode"\] = "unknown"/u);
  assert.match(source, /UnauthorizedAccessException/u);
  assert.match(source, /"permission_denied"/u);
  assert.match(source, /"language_not_supported"/u);
  assert.match(source, /"engine_unavailable"/u);
});
