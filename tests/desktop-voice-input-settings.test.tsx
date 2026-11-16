import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import {
  PlatformSettingsDesktopOptionalDownloads,
} from '../src/app/renderer/settings/PlatformSettingsDesktopOptionalDownloads.tsx';
import {
  PlatformSettingsDesktopVoiceInput,
} from '../src/app/renderer/settings/PlatformSettingsDesktopVoiceInput.tsx';
import { ToastContainer } from '../src/design/components/Toast.tsx';
import { useVoiceInputComposer } from '../src/products/shared/renderer/hooks/useVoiceInputComposer.ts';
import type { DictationLanguageOptions } from '../src/shared/dictationLanguageBridge.ts';
import { dictationLanguageName } from '../src/shared/dictationLanguageLabels.ts';
import type { FeaturePackChange, FeaturePackSnapshot } from '../src/shared/featurePackBridge.ts';
import type { VoiceCaptureEvent } from '../src/shared/voiceCaptureBridge.ts';

// SPEC-146 Phase 5 renderer: Settings > Desktop > Voice input (FR-6), the
// Optional downloads row's link to it (SPEC-145 FR-C2), and the composer's
// Open Settings for an unavailable language (D3). As in the Phase 4 suite, the
// DOM exists before React loads and only synchronous `act` is used.

function setBridge(bridge: Record<string, unknown> | null): void {
  for (const target of new Set<object>([globalThis, window])) {
    if (bridge === null) {
      Reflect.deleteProperty(target, 'catsDesktopHost');
    } else {
      Object.defineProperty(target, 'catsDesktopHost', {
        configurable: true,
        writable: true,
        value: bridge,
      });
    }
  }
}

async function withDom(
  options: { url?: string; bridge?: Record<string, unknown> | null },
  body: () => Promise<void> | void,
): Promise<void> {
  window.history.replaceState(null, '', options.url ?? 'http://localhost/');
  setBridge(options.bridge ?? null);
  try {
    await body();
  } finally {
    cleanup();
    resetTestDom();
    setBridge(null);
    window.history.replaceState(null, '', 'http://localhost/');
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => void, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await sleep(10);
    }
  }
}

function dictationBridge(initial: DictationLanguageOptions, overrides: Record<string, unknown> = {}) {
  const state = { options: initial, sets: [] as string[], loads: 0 };
  return {
    state,
    bridge: {
      getDictationLanguageOptions: async () => {
        state.loads += 1;
        return { ...state.options, value: state.options.value };
      },
      setDictationLanguage: async (value: string) => {
        state.sets.push(value);
        state.options = { ...state.options, value };
      },
      ...overrides,
    },
  };
}

function renderVoiceInput(platform: string, showToast: (message: string) => void = () => {}) {
  return render(
    <I18nProvider locale="en">
      <PlatformSettingsDesktopVoiceInput showToast={showToast} platform={platform} />
    </I18nProvider>,
  );
}

const select = (container: HTMLElement) => container.querySelector('select')!;
const optionLabels = (container: HTMLElement) => [...select(container).options]
  .map((option) => option.textContent);

test('Voice input stays absent without the dictation language bridge', async () => {
  await withDom({ bridge: { featurePacks: {} } }, () => {
    const view = renderVoiceInput('MacIntel');
    assert.equal(view.container.textContent, '');
  });
});

test('macOS follows the system by default and lists native names', async () => {
  const dictation = dictationBridge({
    automatic: 'system',
    system: 'zh-TW',
    options: ['en-US', 'zh-TW'],
    value: 'auto',
  });
  const toasts: string[] = [];
  await withDom({ bridge: dictation.bridge }, async () => {
    const view = renderVoiceInput('MacIntel', (message) => toasts.push(message));
    await until(() => assert.equal(select(view.container).disabled, false));
    assert.deepEqual(optionLabels(view.container), [
      'Follow system (中文（台灣）)',
      'English (United States)',
      '中文（台灣）',
    ]);
    assert.match(view.container.textContent ?? '', /Only languages this Mac can recognize on-device/u);

    fireEvent.change(select(view.container), { target: { value: 'zh-TW' } });
    await until(() => assert.deepEqual(dictation.state.sets, ['zh-TW']));
    await sleep(20);
    assert.equal(select(view.container).value, 'zh-TW');
    assert.deepEqual(toasts, [], 'success is silent');
  });
});

test('Windows says Follow system and shows the Windows privacy message', async () => {
  const dictation = dictationBridge({ automatic: 'system', options: [], value: 'auto' });
  await withDom({ bridge: dictation.bridge }, async () => {
    const view = renderVoiceInput('Win32');
    await until(() => assert.equal(select(view.container).disabled, false));
    assert.deepEqual(optionLabels(view.container), ['Follow system'], 'no list leaves Automatic only');
    assert.match(view.container.textContent ?? '', /Microsoft online speech/u);
  });
});

test('a failed save restores the previous value and says so in a toast', async () => {
  const dictation = dictationBridge(
    { automatic: 'system', options: ['en-US', 'zh-TW'], value: 'en-US' },
    { setDictationLanguage: async () => { throw new Error('This dictation language is not available.'); } },
  );
  const toasts: string[] = [];
  await withDom({ bridge: dictation.bridge }, async () => {
    const view = renderVoiceInput('MacIntel', (message) => toasts.push(message));
    await until(() => assert.equal(select(view.container).value, 'en-US'));
    fireEvent.change(select(view.container), { target: { value: 'zh-TW' } });
    await until(() => assert.deepEqual(toasts, ['The dictation language could not be saved.']));
    assert.equal(select(view.container).value, 'en-US');
  });
});

test('a saved language the machine no longer lists is shown as not available', async () => {
  const dictation = dictationBridge({ automatic: 'system', options: ['en-US'], value: 'ja-JP' });
  await withDom({ bridge: dictation.bridge }, async () => {
    const view = renderVoiceInput('MacIntel');
    await until(() => assert.equal(select(view.container).value, 'ja-JP'));
    const unavailable = [...select(view.container).options].find((option) => option.value === 'ja-JP')!;
    assert.equal(unavailable.textContent, `${dictationLanguageName('ja-JP')} (not available)`);
    assert.equal(unavailable.disabled, true);
  });
});

test('a failed load is a toast, and the select offers Automatic only', async () => {
  const toasts: string[] = [];
  await withDom({
    bridge: {
      getDictationLanguageOptions: async () => { throw new Error('ipc'); },
      setDictationLanguage: async () => {},
    },
  }, async () => {
    const view = renderVoiceInput('Win32', (message) => toasts.push(message));
    await until(() => assert.deepEqual(toasts, ['Dictation languages could not be loaded.']));
    assert.deepEqual(optionLabels(view.container), ['Follow system']);
    assert.equal(select(view.container).disabled, true);
  });
});

function packSnapshot(overrides: Partial<FeaturePackSnapshot> = {}): FeaturePackSnapshot {
  return {
    id: 'linux-stt',
    status: 'not_installed',
    version: '1.1.0',
    activeVersion: null,
    usable: false,
    downloadSize: 148_000_000,
    unpackedSize: 160_000_000,
    receivedBytes: null,
    pauseReason: null,
    unsupported: null,
    installedSize: null,
    languages: [],
    licenses: [{ name: 'MIT', component: 'whisper.cpp' }],
    sourceHost: 'github.com',
    ...overrides,
  };
}

function fakePacks(initial: FeaturePackSnapshot) {
  let listener: ((change: FeaturePackChange) => void) | null = null;
  return {
    emit(change: FeaturePackChange) {
      act(() => {
        listener?.(change);
      });
    },
    bridge: {
      list: async () => [initial],
      get: async () => initial,
      onChange(next: (change: FeaturePackChange) => void) {
        listener = next;
        return () => {
          listener = null;
        };
      },
    },
  };
}

test('Linux waits for the pack, then offers its languages and detection', async () => {
  const dictation = dictationBridge({ automatic: 'detect', options: [], value: 'auto' });
  const packs = fakePacks(packSnapshot());
  await withDom({ bridge: { ...dictation.bridge, featurePacks: packs.bridge } }, async () => {
    const view = renderVoiceInput('Linux aarch64');
    await until(() => assert.match(view.container.textContent ?? '', /download Offline speech recognition/u));
    assert.equal(select(view.container).disabled, true);
    assert.deepEqual(optionLabels(view.container), ['Automatic (detect from speech)']);
    assert.match(view.container.textContent ?? '', /Chinese may come out in Simplified characters/u);
    const loadsBefore = dictation.state.loads;

    // Progress events alone do not reload the options.
    packs.emit({ snapshot: packSnapshot({ status: 'downloading', receivedBytes: 1 }), failure: null });
    await sleep(20);
    assert.equal(dictation.state.loads, loadsBefore);

    dictation.state.options = { automatic: 'detect', options: ['en', 'zh'], value: 'auto' };
    packs.emit({
      snapshot: packSnapshot({ status: 'installed', activeVersion: '1.1.0', usable: true, languages: ['en', 'zh'] }),
      failure: null,
    });
    await until(() => assert.deepEqual(
      optionLabels(view.container),
      ['Automatic (detect from speech)', 'English', '中文'],
    ));
    assert.equal(select(view.container).disabled, false);
    assert.equal(dictation.state.loads, loadsBefore + 1);
    assert.doesNotMatch(view.container.textContent ?? '', /download Offline speech recognition/u);
  });
});

test('#voice-input from the composer toast scrolls to the section', async () => {
  let scrolled = 0;
  const dictation = dictationBridge({ automatic: 'system', options: [], value: 'auto' });
  await withDom({ url: 'http://localhost/settings/desktop#voice-input', bridge: dictation.bridge }, () => {
    const prototype = (window as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement.prototype;
    const original = prototype.scrollIntoView;
    prototype.scrollIntoView = function scrollIntoView() {
      scrolled += 1;
    };
    try {
      const view = renderVoiceInput('MacIntel');
      assert.ok(view.container.querySelector('#voice-input'));
      assert.equal(scrolled, 1);
    } finally {
      prototype.scrollIntoView = original;
    }
  });
});

test('the Optional downloads row links to Voice input while the pack can dictate', async () => {
  const usable = packSnapshot({ status: 'installed', activeVersion: '1.1.0', usable: true, languages: ['en'] });
  for (const [snapshot, linked] of [[packSnapshot(), false], [usable, true]] as const) {
    const packs = fakePacks(snapshot);
    await withDom({ bridge: { featurePacks: packs.bridge } }, async () => {
      const view = render(
        <I18nProvider locale="en">
          <div id="voice-input"><select id="voice-input-dictation-language" /></div>
          <PlatformSettingsDesktopOptionalDownloads showToast={() => {}} />
        </I18nProvider>,
      );
      await until(() => assert.match(view.container.textContent ?? '', /Offline speech recognition/u));
      const link = [...view.container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Choose the dictation language');
      assert.equal(Boolean(link), linked, snapshot.status);
      if (link) {
        const prototype = (window as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement.prototype;
        const original = prototype.scrollIntoView;
        const scrolledTo: string[] = [];
        prototype.scrollIntoView = function scrollIntoView(this: HTMLElement) {
          scrolledTo.push(this.id);
        };
        try {
          fireEvent.click(link);
        } finally {
          prototype.scrollIntoView = original;
        }
        assert.deepEqual(scrolledTo, ['voice-input']);
        assert.equal(document.activeElement?.id, 'voice-input-dictation-language');
      }
    });
  }
});

test('Settings > Desktop orders Startup behavior, Voice input, then Optional downloads', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src', 'app', 'renderer', 'settings', 'PlatformSettingsDesktop.tsx'),
    'utf8',
  );
  const order = [
    '<PlatformSettingsDesktopUpdates',
    '<PlatformSettingsDesktopMobilePairing',
    '<PlatformSettingsDesktopStartupBehavior',
    '<PlatformSettingsDesktopVoiceInput',
    '<PlatformSettingsDesktopOptionalDownloads',
  ].map((tag) => source.indexOf(tag));
  assert.ok(order.every((index) => index >= 0), 'every section is mounted');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

function fakeVoiceBridge(extra: Record<string, unknown> = {}) {
  let sessionId = '';
  let listener: ((event: VoiceCaptureEvent) => void) | null = null;
  return {
    emit: (event: { type: 'error'; reason: string }) => {
      act(() => {
        listener?.({ ...event, sessionId } as VoiceCaptureEvent);
      });
    },
    bridge: {
      startVoiceCapture: async (options: { sessionId: string }) => {
        sessionId = options.sessionId;
      },
      stopVoiceCapture: async () => {},
      cancelVoiceCapture: async () => {},
      onVoiceCaptureEvent: (next: (event: VoiceCaptureEvent) => void) => {
        listener = next;
        return () => {
          listener = null;
        };
      },
      ...extra,
    },
  };
}

function VoiceHarness() {
  const [value, setValue] = useState('');
  const voice = useVoiceInputComposer({ value, onChange: setValue, autoResize: () => {} });
  return (
    <>
      <textarea ref={voice.textareaRef} value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="button" className="mic" onClick={voice.toggle}>mic</button>
      <ToastContainer toasts={voice.toasts} />
    </>
  );
}

test('D3: an unavailable saved language opens Voice input from the composer toast', async () => {
  const voice = fakeVoiceBridge({ setDictationLanguage: async () => {}, getDictationLanguageOptions: async () => null });
  await withDom({ bridge: voice.bridge }, async () => {
    const navigations: string[] = [];
    const record = (event: Event) => {
      navigations.push((event as CustomEvent<{ path: string }>).detail.path);
    };
    window.addEventListener('cats:navigate', record);
    const view = render(<I18nProvider locale="en"><VoiceHarness /></I18nProvider>);
    fireEvent.click(view.container.querySelector('button.mic')!);
    voice.emit({ type: 'error', reason: 'language_not_supported' });
    await until(() => assert.match(
      view.container.textContent ?? '',
      /The dictation language is not available on this computer/u,
    ));
    const action = view.container.querySelector<HTMLButtonElement>('button.toastAction');
    assert.equal(action?.textContent, 'Open Settings');
    fireEvent.click(action!);
    window.removeEventListener('cats:navigate', record);
    assert.deepEqual(navigations, ['/settings/desktop#voice-input']);
  });

  // Without the setting (an older host), the message stands alone.
  const older = fakeVoiceBridge();
  await withDom({ bridge: older.bridge }, async () => {
    const view = render(<I18nProvider locale="en"><VoiceHarness /></I18nProvider>);
    fireEvent.click(view.container.querySelector('button.mic')!);
    older.emit({ type: 'error', reason: 'language_not_supported' });
    await until(() => assert.match(view.container.textContent ?? '', /does not support the current language/u));
    assert.equal(view.container.querySelector('button.toastAction'), null);
  });
});
