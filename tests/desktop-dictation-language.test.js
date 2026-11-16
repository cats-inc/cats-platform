// SPEC-146 host side: the saved value, the helpers' `--list-languages`
// contract, the bridge's options and validation, and the session's `--locale`
// (AC-01, AC-02; AC-03's persistence).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DESKTOP_DICTATION_LANGUAGE_OPTIONS_CHANNEL,
  DESKTOP_DICTATION_LANGUAGE_SET_CHANNEL,
} from '../build/desktop/contracts.js';
import {
  DesktopDictationLanguage,
  isDictationLanguageTag,
  listHelperLanguages,
  normalizeDictationLanguage,
  parseHelperLanguageList,
  readDesktopDictationLanguage,
  registerDictationLanguageIpc,
  resolveDictationSessionLocale,
  updateDesktopDictationLanguage,
} from '../build/desktop/dictationLanguage.js';
import { DesktopVoiceCaptureController } from '../build/desktop/voiceCapture.js';
import {
  normalizeDictationLanguagePreference,
  platformPreferencesAfterDataReset,
  readPlatformPreferences,
  writePlatformPreferences,
} from '../build/server/shared/platformPreferences.js';

async function tempDir(t, prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return dir;
}

/** The app state path the host passes; preferences live in `<root>/platform/config`. */
async function appState(t) {
  const root = await tempDir(t, 'cats-dictation-language-');
  return {
    appStatePath: join(root, 'platform', 'state', 'chat-state.local.json'),
    preferencesPath: join(root, 'platform', 'config', 'platform-preferences.json'),
  };
}

test('stored values are Automatic or a tag in a shape safe for a helper argument', () => {
  for (const tag of ['en', 'zh-TW', 'zh-Hant-TW', 'es-419', 'yue-Hant-HK']) {
    assert.equal(isDictationLanguageTag(tag), true, tag);
    assert.equal(normalizeDictationLanguage(tag), tag);
    assert.equal(normalizeDictationLanguagePreference(tag), tag, 'the server keeps the same shapes');
  }
  for (const value of ['', 'auto ', '--locale', 'en_US', 'e', 'en-', 'x'.repeat(40), 42, null, undefined]) {
    assert.equal(normalizeDictationLanguage(value), 'auto', String(value));
    assert.equal(normalizeDictationLanguagePreference(value), 'auto', String(value));
  }
});

test('the session locale follows the platform rules', () => {
  // macOS and Windows: Automatic passes none; a saved tag passes as saved (FR-5).
  assert.equal(resolveDictationSessionLocale('auto', 'darwin', null), undefined);
  assert.equal(resolveDictationSessionLocale('zh-TW', 'darwin', null), 'zh-TW');
  assert.equal(resolveDictationSessionLocale('zh-TW', 'win32', null), 'zh-TW');
  assert.equal(resolveDictationSessionLocale('--rm', 'win32', null), undefined, 'a bad value is Automatic');
  // Linux: only a subtag the leased manifest lists (SPEC-145 FR-C5).
  assert.equal(resolveDictationSessionLocale('zh', 'linux', ['en', 'zh']), 'zh');
  assert.equal(resolveDictationSessionLocale('ja', 'linux', ['en', 'zh']), undefined);
  assert.equal(resolveDictationSessionLocale('auto', 'linux', ['en', 'zh']), undefined);
});

test('the host writes the value next to the other preferences and keeps them', async (t) => {
  const { appStatePath, preferencesPath } = await appState(t);
  assert.equal(await readDesktopDictationLanguage(appStatePath), 'auto', 'a missing file is Automatic');

  await updateDesktopDictationLanguage(appStatePath, 'zh-TW');
  assert.equal(await readDesktopDictationLanguage(appStatePath), 'zh-TW');

  await writeFile(preferencesPath, JSON.stringify({
    startAtLogin: false,
    someFutureField: { keep: true },
    dictationLanguage: 'zh-TW',
  }));
  await updateDesktopDictationLanguage(appStatePath, 'en-US');
  assert.deepEqual(JSON.parse(await readFile(preferencesPath, 'utf8')), {
    startAtLogin: false,
    someFutureField: { keep: true },
    dictationLanguage: 'en-US',
  });

  await assert.rejects(updateDesktopDictationLanguage(appStatePath, 'en US'), /Invalid/u);
  await writeFile(preferencesPath, JSON.stringify({ dictationLanguage: '; rm -rf' }));
  assert.equal(await readDesktopDictationLanguage(appStatePath), 'auto', 'an invalid value reads as Automatic');
});

test('the value survives the server rewriting the file and a Platform data reset', async (t) => {
  // AC-03: the server writes the whole normalized preferences object, so the
  // field must be one of its own, not an unknown one it would drop.
  const { appStatePath } = await appState(t);
  await updateDesktopDictationLanguage(appStatePath, 'zh-TW');

  const current = await readPlatformPreferences(appStatePath);
  await writePlatformPreferences(appStatePath, { ...current, uiLanguagePreference: 'en' });
  assert.equal(await readDesktopDictationLanguage(appStatePath), 'zh-TW');

  await writePlatformPreferences(
    appStatePath,
    platformPreferencesAfterDataReset(await readPlatformPreferences(appStatePath)),
  );
  assert.equal(await readDesktopDictationLanguage(appStatePath), 'zh-TW');
  assert.equal((await readPlatformPreferences(appStatePath)).uiLanguagePreference, 'auto');
});

test('a listing line is parsed strictly, and odd tags are dropped', () => {
  assert.deepEqual(
    parseHelperLanguageList('{"type":"languages","system":"en-US","languages":["en-US","zh-TW","en-US"]}\n'),
    { system: 'en-US', languages: ['en-US', 'zh-TW'] },
  );
  assert.deepEqual(
    parseHelperLanguageList('{"type":"languages","system":null,"languages":[]}'),
    { system: null, languages: [] },
  );
  assert.deepEqual(
    parseHelperLanguageList('{"type":"languages","system":"en_US","languages":["zh-TW","--x"]}'),
    { system: null, languages: ['zh-TW'] },
  );
  for (const output of [
    '',
    'not json',
    '{"type":"languages","system":null,"languages":[]}\n{"type":"languages","system":null,"languages":[]}',
    '{"type":"ready","languages":[]}',
    '{"type":"languages","languages":"en"}',
    '{"type":"languages","languages":[1]}',
    '{"type":"languages","system":5,"languages":[]}',
    '[]',
  ]) {
    assert.equal(parseHelperLanguageList(output), null, output);
  }
});

/** A scripted native helper: a Node script run through the current Node. */
async function scriptedHelper(t, body) {
  const dir = await tempDir(t, 'cats-dictation-helper-');
  const helperPath = join(dir, 'helper.mjs');
  await writeFile(helperPath, body);
  return helperPath;
}

const runScript = (command, args, options) => spawn(process.execPath, [command, ...args], options);

test('AC-02: scripted helpers that print valid, empty and malformed lines', async (t) => {
  const valid = await scriptedHelper(t, `
    if (process.argv[2] !== '--list-languages') process.exit(2);
    console.log(JSON.stringify({ type: 'languages', system: 'zh-TW', languages: ['en-US', 'zh-TW'] }));
  `);
  assert.deepEqual(
    await listHelperLanguages(valid, { spawnProcess: runScript }),
    { system: 'zh-TW', languages: ['en-US', 'zh-TW'] },
  );

  const empty = await scriptedHelper(t, `
    console.log(JSON.stringify({ type: 'languages', system: null, languages: [] }));
  `);
  assert.deepEqual(await listHelperLanguages(empty, { spawnProcess: runScript }), { system: null, languages: [] });

  const malformed = await scriptedHelper(t, `console.log('{"type":"languages","languages":');`);
  assert.equal(await listHelperLanguages(malformed, { spawnProcess: runScript }), null);

  // Today's helpers reject the flag with usage and exit 2: Automatic only.
  const todays = await scriptedHelper(t, `
    console.error('Usage: cats-stt-macos --session-id <id>');
    process.exit(2);
  `);
  assert.equal(await listHelperLanguages(todays, { spawnProcess: runScript }), null);

  const failing = await scriptedHelper(t, `
    console.log(JSON.stringify({ type: 'languages', system: null, languages: ['en-US'] }));
    process.exit(1);
  `);
  assert.equal(await listHelperLanguages(failing, { spawnProcess: runScript }), null, 'a non-zero exit is no list');

  const hanging = await scriptedHelper(t, 'setInterval(() => {}, 1000);');
  const started = Date.now();
  assert.equal(await listHelperLanguages(hanging, { spawnProcess: runScript, timeoutMs: 200 }), null);
  assert.ok(Date.now() - started < 2_000, 'the listing is killed at its timeout');

  assert.equal(await listHelperLanguages(join(tmpdir(), 'cats-no-such-helper')), null, 'a missing helper is no list');
});

function memoryStore(initial = 'auto') {
  const state = { value: initial, writes: [] };
  return {
    state,
    read: async () => state.value,
    write: async (value) => {
      state.writes.push(value);
      state.value = value;
    },
  };
}

test('macOS and Windows options come from one listing at a time, refreshed on each request', async () => {
  const store = memoryStore('zh-TW');
  let listings = 0;
  let release;
  const service = new DesktopDictationLanguage({
    platform: 'darwin',
    read: store.read,
    write: store.write,
    listLanguages: () => {
      listings += 1;
      return new Promise((resolve) => {
        release = () => resolve({ system: 'en-US', languages: ['en-US', 'zh-TW'] });
      });
    },
  });

  const first = service.getOptions();
  const second = service.getOptions();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(listings, 1, 'concurrent requests share one listing');
  release();
  const expected = { automatic: 'system', system: 'en-US', options: ['en-US', 'zh-TW'], value: 'zh-TW' };
  assert.deepEqual(await first, expected);
  assert.deepEqual(await second, expected);

  const third = service.getOptions();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await third;
  assert.equal(listings, 2, 'opening the section again lists again');
});

test('a new value must be one of the current options', async () => {
  const store = memoryStore();
  let list = { system: null, languages: ['en-US', 'zh-TW'] };
  const service = new DesktopDictationLanguage({
    platform: 'win32',
    read: store.read,
    write: store.write,
    listLanguages: async () => list,
  });

  await service.setValue('zh-TW');
  assert.equal(store.state.value, 'zh-TW', 'without a cached list, the host lists first');
  await assert.rejects(service.setValue('ja-JP'), /not available/u);
  await assert.rejects(service.setValue(5), /Invalid/u);
  await service.setValue('auto');

  list = null;
  assert.deepEqual(await service.getOptions(), { automatic: 'system', options: [], value: 'auto' });
  await assert.rejects(service.setValue('zh-TW'), /not available/u, 'with no list, only Automatic');
  await service.setValue('auto');
  assert.deepEqual(store.state.writes, ['zh-TW', 'auto', 'auto']);
});

test('Linux options are the usable pack languages, and Automatic detects', async () => {
  const store = memoryStore('zh');
  let languages = [];
  const service = new DesktopDictationLanguage({
    platform: 'linux',
    read: store.read,
    write: store.write,
    listLanguages: async () => assert.fail('Linux never runs a listing helper'),
    packLanguages: async () => languages,
  });

  assert.deepEqual(await service.getOptions(), { automatic: 'detect', options: [], value: 'zh' });
  await assert.rejects(service.setValue('zh'), /not available/u, 'nothing but Automatic before the pack');

  languages = ['en', 'zh', 'ja'];
  assert.deepEqual(await service.getOptions(), { automatic: 'detect', options: ['en', 'zh', 'ja'], value: 'zh' });
  await service.setValue('ja');
  assert.equal(store.state.value, 'ja');
});

test('both bridge channels accept only the main window main frame', async () => {
  const handlers = new Map();
  const mainFrame = { routingId: 1, processId: 7 };
  const webContents = { id: 3, mainFrame };
  const mainWindow = { webContents, isDestroyed: () => false };
  const store = memoryStore();
  registerDictationLanguageIpc({
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    service: new DesktopDictationLanguage({
      platform: 'linux',
      read: store.read,
      write: store.write,
      packLanguages: async () => ['en'],
    }),
    mainWindow: () => mainWindow,
  });
  assert.deepEqual([...handlers.keys()], [
    DESKTOP_DICTATION_LANGUAGE_OPTIONS_CHANNEL,
    DESKTOP_DICTATION_LANGUAGE_SET_CHANNEL,
  ]);

  const fromMainFrame = { sender: webContents, senderFrame: mainFrame };
  const fromSubframe = { sender: webContents, senderFrame: { routingId: 2, processId: 7 } };
  assert.equal((await handlers.get(DESKTOP_DICTATION_LANGUAGE_OPTIONS_CHANNEL)(fromMainFrame)).automatic, 'detect');
  await handlers.get(DESKTOP_DICTATION_LANGUAGE_SET_CHANNEL)(fromMainFrame, 'en');
  assert.equal(store.state.value, 'en');

  await assert.rejects(
    async () => handlers.get(DESKTOP_DICTATION_LANGUAGE_OPTIONS_CHANNEL)(fromSubframe),
    /main Cats window/u,
  );
  await assert.rejects(
    async () => handlers.get(DESKTOP_DICTATION_LANGUAGE_SET_CHANNEL)(fromSubframe, 'auto'),
    /main Cats window/u,
  );
  assert.equal(store.state.value, 'en');
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: () => true };
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    return true;
  };
  return child;
}

async function macController(t, dictationLanguage) {
  const dir = await tempDir(t, 'cats-dictation-session-');
  const helperPath = join(dir, 'helper');
  await writeFile(helperPath, '#!/bin/sh\n');
  const spawns = [];
  const events = [];
  const controller = new DesktopVoiceCaptureController({
    config: { packaged: false, packageRoot: dir },
    platform: 'darwin',
    env: { CATS_VOICE_CAPTURE_HELPER: helperPath },
    sendEvent: (event) => events.push(event),
    spawnProcess: (command, args) => {
      spawns.push(args);
      return fakeChild();
    },
    ...(dictationLanguage ? { dictationLanguage } : {}),
    logLine: () => {},
  });
  return { controller, events, spawns };
}

test('AC-01: the saved tag becomes --locale and the renderer locale is ignored', async (t) => {
  let saved = 'zh-TW';
  const { controller, spawns } = await macController(t, async () => saved);

  await controller.startVoiceCapture({ sessionId: 's1', locale: 'en-US' });
  assert.deepEqual(spawns.at(-1), ['--session-id', 's1', '--locale', 'zh-TW']);
  await controller.cancelVoiceCapture('s1');

  saved = 'auto';
  await controller.startVoiceCapture({ sessionId: 's2', locale: 'en-US' });
  assert.deepEqual(spawns.at(-1), ['--session-id', 's2'], 'Automatic passes no --locale');
  await controller.cancelVoiceCapture('s2');

  const unset = await macController(t, null);
  await unset.controller.startVoiceCapture({ sessionId: 's3', locale: 'en-US' });
  assert.deepEqual(unset.spawns.at(-1), ['--session-id', 's3'], 'without a setting, no renderer locale either');
});

test('a stop while the setting is read ends the session without a helper', async (t) => {
  let resolveRead;
  const { controller, events, spawns } = await macController(t, () => new Promise((resolve) => {
    resolveRead = resolve;
  }));

  const starting = controller.startVoiceCapture({ sessionId: 's1' });
  await controller.stopVoiceCapture('s1');
  resolveRead('zh-TW');
  await starting;

  assert.deepEqual(spawns, []);
  assert.deepEqual(events, [{ type: 'end', sessionId: 's1' }]);
});

test('an unreadable setting starts the session as Automatic', async (t) => {
  const { controller, spawns } = await macController(t, async () => {
    throw new Error('disk gone');
  });
  await controller.startVoiceCapture({ sessionId: 's1' });
  assert.deepEqual(spawns.at(-1), ['--session-id', 's1']);
});
