import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import {
  requestRendererNavigation,
  useRendererNavigationRequests,
} from '../src/app/renderer/rendererNavigation.ts';
import {
  OPTIONAL_DOWNLOAD_ACTIONS,
  PlatformSettingsDesktopOptionalDownloads,
} from '../src/app/renderer/settings/PlatformSettingsDesktopOptionalDownloads.tsx';
import { ToastContainer } from '../src/design/components/Toast.tsx';
import {
  useConversationComposerState,
} from '../src/products/shared/renderer/conversationViewMemory.ts';
import {
  useVoiceInputComposer,
  type UseVoiceInputComposerResult,
} from '../src/products/shared/renderer/hooks/useVoiceInputComposer.ts';
import type {
  FeaturePackChange,
  FeaturePackSnapshot,
  FeaturePackStatus,
} from '../src/shared/featurePackBridge.ts';
import {
  resolveFeaturePackFailureMessage,
  resolveFeaturePackRequiredMessage,
} from '../src/shared/featurePackLabels.ts';
import { t as translateEn } from '../src/shared/i18n/index.ts';
import type { VoiceCaptureEvent } from '../src/shared/voiceCaptureBridge.ts';

// SPEC-145 Phase 4: the composer's pack toast and states, no Web Speech in
// Desktop, and Settings > Desktop > Optional downloads (FR-C1-FR-C3, FR-D1,
// FR-D5). The DOM exists before React loads, so controlled inputs fire
// onChange (helpers/installDomBeforeReact.ts). Only synchronous `act` and plain
// sleeps are used: under the ESM test bundle, `await act(async …)` and `waitFor`
// leave MessageChannel handles that keep the no-isolation suite alive.

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
  // The global window, not this file's testDomWindow: with no test isolation,
  // the last bundle to load owns `window`, and that is what React renders into.
  window.history.replaceState(null, '', options.url ?? 'http://localhost/');
  setBridge(options.bridge ?? null);
  try {
    await body();
  } finally {
    cleanup();
    resetTestDom();
    setBridge(null);
    Reflect.deleteProperty(window, 'SpeechRecognition');
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

function fakePacks(initial: FeaturePackSnapshot[]) {
  const calls: Array<[string, string]> = [];
  let listener: ((change: FeaturePackChange) => void) | null = null;
  const record = (name: string) => async (id: string) => {
    calls.push([name, id]);
  };
  return {
    calls,
    emit(change: FeaturePackChange) {
      act(() => {
        listener?.(change);
      });
    },
    bridge: {
      list: async () => initial,
      get: async (id: string) => initial.find((snapshot) => snapshot.id === id) ?? initial[0],
      download: record('download'),
      pause: record('pause'),
      resume: record('resume'),
      cancel: record('cancel'),
      check: async (id: string) => {
        calls.push(['check', id]);
        return initial[0];
      },
      remove: record('remove'),
      onChange(next: (change: FeaturePackChange) => void) {
        listener = next;
        return () => {
          listener = null;
        };
      },
    },
  };
}

function renderSection(showToast: (message: string) => void) {
  return render(
    <I18nProvider locale="en">
      <PlatformSettingsDesktopOptionalDownloads showToast={showToast} />
    </I18nProvider>,
  );
}

const buttonLabels = (container: HTMLElement) => [...container.querySelectorAll('button')]
  .map((button) => button.textContent);

test('Optional downloads stays absent without a pack bridge', async () => {
  await withDom({ bridge: { startVoiceCapture: async () => {} } }, () => {
    const view = renderSection(() => {});
    assert.equal(view.container.textContent, '');
  });
});

test('the section exists before its list, so #optional-downloads can scroll to it', async () => {
  let scrolled = 0;
  await withDom({
    url: 'http://localhost/settings/desktop#optional-downloads',
    bridge: {
      featurePacks: {
        ...fakePacks([]).bridge,
        list: () => new Promise(() => {}),
      },
    },
  }, () => {
    const prototype = (window as unknown as { HTMLElement: typeof HTMLElement })
      .HTMLElement.prototype;
    const original = prototype.scrollIntoView;
    prototype.scrollIntoView = function scrollIntoView() {
      scrolled += 1;
    };
    try {
      const view = renderSection(() => {});
      assert.ok(view.container.querySelector('#optional-downloads'));
      assert.equal(scrolled, 1);
    } finally {
      prototype.scrollIntoView = original;
    }
  });
});

test('a Check files failure says the files changed, once', async () => {
  const packs = fakePacks([packSnapshot({ status: 'installed', activeVersion: '1.1.0' })]);
  const toasts: string[] = [];
  await withDom({
    bridge: {
      featurePacks: {
        ...packs.bridge,
        // The host emits the failure before check() resolves (FR-C2).
        check: async () => {
          packs.emit({
            snapshot: packSnapshot({ status: 'damaged', activeVersion: '1.1.0' }),
            failure: { stage: 'extract', code: 'file_hash_mismatch', message: 'model.bin' },
          });
          return packSnapshot({ status: 'damaged', activeVersion: '1.1.0' });
        },
      },
    },
  }, async () => {
    const view = renderSection((message) => toasts.push(message));
    await until(() => assert.match(view.container.textContent ?? '', /Check files/u));
    const check = [...view.container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Check files')!;
    fireEvent.click(check);
    await until(() => assert.deepEqual(buttonLabels(view.container), ['Download', 'Remove']));
    await sleep(20);
    assert.deepEqual(toasts, ['Some files are missing or changed. Download it again.']);
  });
});

test('every status shows the FR-C2 actions', async () => {
  const labels: Record<string, string> = {
    download: 'Download',
    update: 'Update',
    resume: 'Resume',
    pause: 'Pause',
    cancel: 'Cancel',
    discard: 'Discard',
    check: 'Check files',
    remove: 'Remove',
  };
  for (const status of Object.keys(OPTIONAL_DOWNLOAD_ACTIONS) as FeaturePackStatus[]) {
    const snapshot = packSnapshot({
      status,
      receivedBytes: status === 'downloading' || status === 'paused' ? 37_000_000 : null,
      pauseReason: status === 'paused' ? 'network' : null,
      activeVersion: status === 'installed' || status === 'update_available' ? '1.0.0' : null,
      unsupported: status === 'unsupported' ? { reason: 'glibc', detail: '2.35' } : null,
    });
    await withDom({ bridge: { featurePacks: fakePacks([snapshot]).bridge } }, async () => {
      const view = renderSection(() => {});
      await until(() => {
        assert.match(view.container.textContent ?? '', /Offline speech recognition/u);
      });
      assert.deepEqual(
        buttonLabels(view.container),
        OPTIONAL_DOWNLOAD_ACTIONS[status].map((action) => labels[action]),
        status,
      );
    });
  }
});

test('the row is the consent surface and its actions call the bridge by id', async () => {
  const packs = fakePacks([packSnapshot({ status: 'update_available', activeVersion: '1.0.0' })]);
  await withDom({ bridge: { featurePacks: packs.bridge } }, async () => {
    const view = renderSection(() => {});
    await until(() => assert.match(view.container.textContent ?? '', /Update/u));
    const text = view.container.textContent ?? '';
    assert.match(text, /Audio never leaves this computer/u);
    assert.match(text, /About 148 MB from github\.com/u);
    assert.match(text, /Licenses: MIT \(whisper\.cpp\)/u);
    assert.match(text, /Version 1\.0\.0 installed; version 1\.1\.0 is available/u);

    for (const label of ['Update', 'Check files', 'Remove']) {
      const button = [...view.container.querySelectorAll('button')]
        .find((candidate) => candidate.textContent === label);
      assert.ok(button, label);
      fireEvent.click(button);
      await until(() => assert.equal(button.disabled, false));
    }
    assert.deepEqual(packs.calls, [
      ['download', 'linux-stt'],
      ['check', 'linux-stt'],
      ['remove', 'linux-stt'],
    ]);
  });
});

test('progress is shown in full and announced in coarse steps', async () => {
  const packs = fakePacks([packSnapshot()]);
  await withDom({ bridge: { featurePacks: packs.bridge } }, async () => {
    const view = renderSection(() => {});
    await until(() => assert.match(view.container.textContent ?? '', /Not downloaded/u));
    packs.emit({
      snapshot: packSnapshot({ status: 'downloading', receivedBytes: 55_500_000 }),
      failure: null,
    });
    assert.match(view.container.textContent ?? '', /Downloading: 56 MB of 148 MB/u);
    assert.equal(view.container.querySelector('progress')?.getAttribute('value'), '37');
    assert.equal(
      view.container.querySelector('[aria-live="polite"]')?.textContent,
      'Downloading, 30%',
    );
    packs.emit({
      snapshot: packSnapshot({ status: 'paused', receivedBytes: 55_500_000, pauseReason: 'quit' }),
      failure: null,
    });
    assert.match(view.container.textContent ?? '', /Cats closed during the download/u);
    assert.deepEqual(buttonLabels(view.container), ['Resume', 'Discard']);
  });
});

test('failures become catalog toasts, never raw host messages', async () => {
  const packs = fakePacks([packSnapshot({ status: 'installed', activeVersion: '1.1.0' })]);
  const toasts: string[] = [];
  await withDom({ bridge: { featurePacks: packs.bridge } }, async () => {
    const view = renderSection((message) => toasts.push(message));
    await until(() => assert.match(view.container.textContent ?? '', /Check files/u));
    packs.emit({
      snapshot: packSnapshot({ status: 'paused', pauseReason: 'network', receivedBytes: 1 }),
      failure: { stage: 'download', code: 'network', message: 'fixture connection reset' },
    });
    packs.emit({
      snapshot: packSnapshot(),
      failure: { stage: 'space', code: 'insufficient_space', message: '9 bytes are free' },
    });
    assert.deepEqual(toasts, [
      'The download was interrupted. Resume it when you are online.',
      'There is not enough disk space for this download.',
    ]);
    assert.ok(toasts.every((toast) => !/fixture|bytes are free/u.test(toast)));
  });

  assert.equal(
    resolveFeaturePackFailureMessage({ stage: 'extract', code: 'file_hash_mismatch' }, translateEn),
    'The download did not pass its check, so it was discarded.',
  );
  assert.equal(
    resolveFeaturePackFailureMessage(
      { stage: 'extract', code: 'file_hash_mismatch' },
      translateEn,
      { checking: true },
    ),
    'Some files are missing or changed. Download it again.',
  );
});

test('a bridge rejection and a failed list are toasts too', async () => {
  const packs = fakePacks([packSnapshot()]);
  const toasts: string[] = [];
  await withDom({
    bridge: {
      featurePacks: {
        ...packs.bridge,
        download: async () => {
          throw new Error('Error invoking remote method: Unknown optional download.');
        },
      },
    },
  }, async () => {
    const view = renderSection((message) => toasts.push(message));
    await until(() => assert.match(view.container.textContent ?? '', /Download/u));
    fireEvent.click([...view.container.querySelectorAll('button')][0]!);
    await until(() => assert.deepEqual(toasts, ['The optional download did not complete.']));
  });
  await withDom({
    bridge: { featurePacks: { ...packs.bridge, list: async () => { throw new Error('ipc'); } } },
  }, async () => {
    toasts.length = 0;
    renderSection((message) => toasts.push(message));
    await until(() => assert.deepEqual(toasts, ['Optional downloads could not be loaded.']));
  });
});

test('the pack_required toast names the pack state, and only fixable states open Settings', () => {
  const cases: Array<[FeaturePackSnapshot | null, string, boolean]> = [
    [null, 'Voice input needs offline speech recognition.', true],
    [packSnapshot(), 'Voice input needs offline speech recognition (about 148 MB).', true],
    [
      packSnapshot({ status: 'update_required' }),
      'Voice input needs an update to offline speech recognition (about 148 MB).',
      true,
    ],
    [
      packSnapshot({ status: 'damaged' }),
      'Offline speech recognition needs to be downloaded again.',
      true,
    ],
    [
      packSnapshot({ status: 'downloading', receivedBytes: 74_000_000 }),
      'Offline speech recognition is downloading (50%).',
      true,
    ],
    [
      packSnapshot({ status: 'verifying' }),
      'Offline speech recognition is downloading (100%).',
      true,
    ],
    [
      packSnapshot({ status: 'paused', receivedBytes: 14_800_000, pauseReason: 'owner' }),
      'The offline speech recognition download is paused (10%).',
      true,
    ],
    [
      packSnapshot({ status: 'unsupported', unsupported: { reason: 'glibc', detail: '2.35' } }),
      'Offline speech recognition needs glibc 2.35 or later.',
      false,
    ],
    [
      packSnapshot({
        status: 'unsupported',
        unsupported: { reason: 'prerequisite', detail: 'libpulse.so.0' },
      }),
      'Offline speech recognition needs the system library libpulse.so.0.',
      false,
    ],
    [
      packSnapshot({ status: 'installed' }),
      'Offline speech recognition is ready. Start voice input again.',
      false,
    ],
  ];
  for (const [snapshot, text, openSettings] of cases) {
    assert.deepEqual(
      resolveFeaturePackRequiredMessage(snapshot, translateEn),
      { text, openSettings },
    );
  }
});

type WithoutSession<T> = T extends unknown ? Omit<T, 'sessionId'> : never;

interface VoiceBridgeFake {
  bridge: Record<string, unknown>;
  calls: string[];
  sessionId: () => string;
  emit: (event: WithoutSession<VoiceCaptureEvent>) => void;
}

function fakeVoiceBridge(extra: Record<string, unknown> = {}): VoiceBridgeFake {
  const calls: string[] = [];
  let sessionId = '';
  let listener: ((event: VoiceCaptureEvent) => void) | null = null;
  return {
    calls,
    sessionId: () => sessionId,
    emit: (event) => {
      act(() => {
        listener?.({ ...event, sessionId } as VoiceCaptureEvent);
      });
    },
    bridge: {
      startVoiceCapture: async (options: { sessionId: string }) => {
        sessionId = options.sessionId;
        calls.push('start');
      },
      stopVoiceCapture: async () => {
        calls.push('stop');
      },
      cancelVoiceCapture: async () => {
        calls.push('cancel');
      },
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

function VoiceHarness({ onResult }: { onResult: (result: UseVoiceInputComposerResult) => void }) {
  const [value, setValue] = useState('');
  const voice = useVoiceInputComposer({ value, onChange: setValue, autoResize: () => {} });
  onResult(voice);
  return (
    <>
      <textarea
        ref={voice.textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {voice.supported
        ? <button type="button" className="mic" onClick={voice.toggle}>mic</button>
        : null}
      <ToastContainer toasts={voice.toasts} />
    </>
  );
}

function renderVoice() {
  let latest: UseVoiceInputComposerResult | null = null;
  const view = render(
    <I18nProvider locale="en">
      <VoiceHarness onResult={(result) => { latest = result; }} />
    </I18nProvider>,
  );
  return { view, result: () => latest! };
}

test('pack_required names the pack state, and Open Settings asks for its row', async () => {
  const voice = fakeVoiceBridge({
    featurePacks: {
      get: async () => packSnapshot({ status: 'paused', receivedBytes: 74_000_000 }),
    },
  });
  await withDom({ bridge: voice.bridge }, async () => {
    const navigations: string[] = [];
    const record = (event: Event) => {
      navigations.push((event as CustomEvent<{ path: string }>).detail.path);
    };
    window.addEventListener('cats:navigate', record);
    const { view } = renderVoice();
    fireEvent.click(view.container.querySelector('button.mic')!);
    voice.emit({ type: 'error', reason: 'pack_required' });

    await until(() => assert.match(
      view.container.textContent ?? '',
      /The offline speech recognition download is paused \(50%\)\./u,
    ));
    const action = view.container.querySelector<HTMLButtonElement>('button.toastAction');
    assert.equal(action?.textContent, 'Open Settings');
    fireEvent.click(action!);
    window.removeEventListener('cats:navigate', record);
    assert.deepEqual(navigations, ['/settings/desktop#optional-downloads']);
  });
});

test('processing makes the button busy, shows no chip, and Escape still cancels', async () => {
  const voice = fakeVoiceBridge();
  await withDom({ bridge: voice.bridge }, () => {
    const { view, result } = renderVoice();
    const mic = view.container.querySelector<HTMLButtonElement>('button.mic')!;
    fireEvent.click(mic);
    voice.emit({ type: 'ready', locale: 'auto', mode: 'on-device' });
    assert.equal(result().listening, true);

    voice.emit({ type: 'limit_warning', secondsRemaining: 5 });
    assert.equal(result().limitWarningSeconds, 5);

    fireEvent.click(mic);
    voice.emit({ type: 'processing' });
    assert.equal(result().processing, true);
    assert.equal(result().listening, false, 'processing is not listening');
    assert.equal(result().limitWarningSeconds, null, 'the chip clears');

    fireEvent.click(mic);
    assert.deepEqual(voice.calls, ['start', 'stop'], 'a busy button does nothing');

    mic.focus();
    fireEvent.keyDown(mic, { key: 'Escape' });
    assert.deepEqual(voice.calls, ['start', 'stop', 'cancel']);
    assert.equal(result().processing, false);
  });
});

test('a session that ends without final clears the busy state', async () => {
  const voice = fakeVoiceBridge();
  await withDom({ bridge: voice.bridge }, () => {
    const { view, result } = renderVoice();
    fireEvent.click(view.container.querySelector('button.mic')!);
    voice.emit({ type: 'ready', locale: 'auto', mode: 'on-device' });
    voice.emit({ type: 'processing' });
    voice.emit({ type: 'end' });
    assert.equal(result().processing, false);
    assert.equal(result().supported, true);
  });
});

test('the Desktop renderer never constructs Web Speech; the Web still does', async () => {
  let constructed = 0;
  class SpeechRecognitionSpy {
    continuous = false;
    interimResults = false;
    lang = '';
    onresult = null;
    onerror = null;
    onend = null;
    constructor() {
      constructed += 1;
    }
    start() {}
    stop() {}
    abort() {}
  }

  // Desktop without a native voice bridge: Linux before a pack, for example.
  await withDom({ bridge: { getUpdateSnapshot: async () => null } }, () => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = SpeechRecognitionSpy;
    const { view, result } = renderVoice();
    assert.equal(result().supported, false);
    assert.equal(view.container.querySelector('button.mic'), null);
    act(() => result().toggle());
    assert.equal(constructed, 0);
  });

  await withDom({ bridge: null }, () => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = SpeechRecognitionSpy;
    const { result } = renderVoice();
    assert.equal(result().supported, true, 'the Web path is unchanged');
    act(() => result().toggle());
    assert.equal(constructed, 1);
  });
});

function DraftRoute() {
  const { composerDraft, setComposerDraft } = useConversationComposerState('scope', 'channel:c1');
  const navigate = useNavigate();
  return (
    <>
      <textarea value={composerDraft} onChange={(event) => setComposerDraft(event.target.value)} />
      <button
        type="button"
        className="ask"
        onClick={() => requestRendererNavigation('/settings/desktop#optional-downloads')}
      >
        ask
      </button>
      <button type="button" className="back" onClick={() => navigate('/chat/c1')}>back</button>
    </>
  );
}

function SettingsRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <button type="button" className="return" onClick={() => navigate('/chat/c1')}>
      {`${location.pathname}${location.hash}`}
    </button>
  );
}

function RoutedApp() {
  useRendererNavigationRequests();
  return (
    <Routes>
      <Route path="/chat/c1" element={<DraftRoute />} />
      <Route path="/settings/desktop" element={<SettingsRoute />} />
    </Routes>
  );
}

test('the app root handles navigation requests', async () => {
  // Without this listener, Open Settings would silently do nothing.
  const appPath = path.join(process.cwd(), 'src', 'app', 'renderer', 'App.tsx');
  const source = await readFile(appPath, 'utf8');
  const body = source.slice(source.indexOf('export default function PlatformApp()'));
  assert.match(body.slice(0, 600), /useRendererNavigationRequests\(\);/u);
});

test('Open Settings is an in-app route change, so the draft survives the round trip', async () => {
  await withDom({}, () => {
    const view = render(
      <MemoryRouter initialEntries={['/chat/c1']}>
        <RoutedApp />
      </MemoryRouter>,
    );
    fireEvent.change(view.container.querySelector('textarea')!, {
      target: { value: 'unsent words' },
    });
    assert.equal(view.container.querySelector('textarea')?.value, 'unsent words', 'typed');
    act(() => {
      fireEvent.click(view.container.querySelector('button.ask')!);
    });
    assert.equal(
      view.container.querySelector('button.return')?.textContent,
      '/settings/desktop#optional-downloads',
    );
    act(() => {
      fireEvent.click(view.container.querySelector('button.return')!);
    });
    assert.equal(view.container.querySelector('textarea')?.value, 'unsent words');
  });
});
