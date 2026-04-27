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
  assert.match(source, /if \(disabled && voiceInputActive\) cancel\(\);/u);
  assert.doesNotMatch(source, /if \(disabled && listening\) stop\(\);/u);
  assert.match(source, /useNativeVoiceInput\(/u);
  assert.match(source, /useWebSpeechInput\(/u);
});

test('useVoiceInputComposer falls back to append when textarea selection is untrusted', async () => {
  const source = await readFile(
    path.join(HOOKS_DIR, 'useVoiceInputComposer.ts'),
    'utf8',
  );

  assert.match(source, /hasUserSelectionRef/u);
  assert.match(source, /trustedSelectionValueRef/u);
  assert.match(source, /document\.activeElement === el/u);
  assert.match(source, /addEventListener\(['"]focus['"]/u);
  assert.match(source, /addEventListener\(['"]input['"]/u);
  assert.match(source, /selectionIsTrustworthy/u);
  assert.match(source, /trustedSelectionValueRef\.current === current/u);
  assert.match(source, /trustedSelectionValueRef\.current === value/u);
  assert.match(source, /trustedSelectionValueRef\.current = nextValue/u);
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
    assert.match(
      source,
      /<ToastContainer toasts=\{voiceInputToasts\}/u,
      `${path.basename(file)} must render voice-input toasts`,
    );
    assert.match(
      source,
      /privacyMessage: voiceInputPrivacyMessage/u,
      `${path.basename(file)} must read voice-input privacy message`,
    );
    assert.match(
      source,
      /composerVoicePrivacyBadge/u,
      `${path.basename(file)} must surface the privacy badge when needed`,
    );
  }
});

test('useWebSpeechInput never permanently disables itself on runtime errors', async () => {
  const source = await readFile(
    path.join(HOOKS_DIR, 'useWebSpeechInput.ts'),
    'utf8',
  );

  assert.doesNotMatch(source, /setSupported\(false\)/u);
  assert.match(source, /onError\?:/u);
  assert.match(source, /onErrorRef\.current\?\.\(kind\)/u);
});

test('useVoiceInputComposer surfaces recognition errors via toast', async () => {
  const source = await readFile(
    path.join(HOOKS_DIR, 'useVoiceInputComposer.ts'),
    'utf8',
  );

  assert.match(source, /useToast/u);
  assert.match(source, /showToast\(resolveVoiceErrorMessage\(kind\)\)/u);
  assert.match(source, /permission_denied/u);
  assert.match(source, /permission_not_determined/u);
  assert.match(source, /mic_unavailable/u);
  assert.match(source, /language_not_supported/u);
  assert.match(source, /engine_unavailable/u);
  assert.match(source, /helper_crashed/u);
  assert.match(source, /return \{\s*supported,\s*listening,\s*toggle,\s*textareaRef,\s*toasts,/u);
});

test('voice capture bridge contract carries typed ready mode and closed errors', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src', 'shared', 'voiceCaptureBridge.ts'),
    'utf8',
  );
  const desktopBridgeSource = await readFile(
    path.join(process.cwd(), 'src', 'shared', 'desktopRecoveryBridge.ts'),
    'utf8',
  );

  assert.match(source, /VoiceCaptureMode = 'on-device' \| 'cloud' \| 'unknown'/u);
  assert.match(source, /type: 'ready'/u);
  assert.match(source, /mode: VoiceCaptureMode/u);
  assert.match(source, /VOICE_CAPTURE_ERROR_REASONS/u);
  assert.match(source, /'permission_denied'/u);
  assert.match(source, /'permission_not_determined'/u);
  assert.match(source, /'mic_unavailable'/u);
  assert.match(source, /'language_not_supported'/u);
  assert.match(source, /'engine_unavailable'/u);
  assert.match(source, /'helper_crashed'/u);
  assert.match(source, /'cancelled'/u);
  assert.match(source, /'aborted'/u);
  assert.match(desktopBridgeSource, /startVoiceCapture\?: VoiceCaptureBridge/u);
  assert.match(desktopBridgeSource, /stopVoiceCapture\?: VoiceCaptureBridge/u);
  assert.match(desktopBridgeSource, /cancelVoiceCapture\?: VoiceCaptureBridge/u);
  assert.match(desktopBridgeSource, /onVoiceCaptureEvent\?: VoiceCaptureBridge/u);
});

test('useNativeVoiceInput inserts finals only and waits for ready before active listening', async () => {
  const source = await readFile(
    path.join(HOOKS_DIR, 'useNativeVoiceInput.ts'),
    'utf8',
  );

  assert.match(source, /resolveDesktopHostBridge/u);
  assert.match(source, /startVoiceCapture\(\{ sessionId, locale: lang \}\)/u);
  assert.match(source, /case 'ready':\s*setStatus\('ready'\);\s*setPrivacyMode\(event\.mode\);/u);
  assert.match(source, /case 'partial':\s*break;/u);
  assert.match(source, /case 'final':\s*onTranscriptRef\.current\(event\.text\);/u);
  assert.match(source, /listening: status === 'ready'/u);
  assert.match(source, /active: status !== 'idle'/u);
});

test('useVoiceInputComposer prefers native bridge and routes privacy mode warnings', async () => {
  const source = await readFile(
    path.join(HOOKS_DIR, 'useVoiceInputComposer.ts'),
    'utf8',
  );

  assert.match(source, /nativeVoiceInput\.supported \? nativeVoiceInput : webSpeechInput/u);
  assert.match(source, /resolveVoicePrivacyMessage/u);
  assert.match(source, /mode === 'unknown'/u);
  assert.match(source, /may use Microsoft online speech/u);
  assert.match(source, /mode === 'cloud'/u);
  assert.match(source, /privacyMode = nativeVoiceInput\.supported \? nativeVoiceInput\.privacyMode : null/u);
  assert.match(source, /privacyMessage = resolveVoicePrivacyMessage\(privacyMode\)/u);
});

test('useVoiceInputComposer cancels active voice input on Escape', async () => {
  const source = await readFile(
    path.join(HOOKS_DIR, 'useVoiceInputComposer.ts'),
    'utf8',
  );

  assert.match(source, /event\.key !== 'Escape'/u);
  assert.match(source, /!voiceInputActive/u);
  assert.match(source, /event\.preventDefault\(\);/u);
  assert.match(source, /cancel\(\);/u);
});
