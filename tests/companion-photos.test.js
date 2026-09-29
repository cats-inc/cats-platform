import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  extractCompanionPhotoDirective,
  listCompanionPhotoCandidates,
} from '../build/server/products/chat/companion/life/photos.js';
import {
  normalizeCompanionLifeProfile,
  validateCompanionLifeUpdate,
} from '../build/server/products/chat/companion/life/profile.js';
import { buildCompanionHeartbeatPrompt } from '../build/server/products/chat/companion/life/heartbeat.js';
import { createTelegramBotApiDeliveryClient } from '../build/server/platform/transports/telegram/delivery.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function createPhotoFolder() {
  const folder = await mkdtemp(path.join(tmpdir(), 'cats-companion-photos-'));
  await writeFile(path.join(folder, 'window-sun.png'), ONE_PIXEL_PNG);
  await writeFile(path.join(folder, 'breakfast.JPG'), ONE_PIXEL_PNG);
  await writeFile(path.join(folder, 'notes.txt'), 'not a photo');
  await mkdir(path.join(folder, 'nested.png'));
  return folder;
}

test('photo candidates are image files directly in the folder, sampled up to the limit', async () => {
  const folder = await createPhotoFolder();
  assert.deepEqual(
    (await listCompanionPhotoCandidates(folder, () => 0)).sort(),
    ['breakfast.JPG', 'window-sun.png'],
  );
  assert.equal((await listCompanionPhotoCandidates(folder, () => 0, 1)).length, 1);
  assert.deepEqual(await listCompanionPhotoCandidates(path.join(folder, 'missing')), []);
  assert.deepEqual(await listCompanionPhotoCandidates(null), []);
});

test('only an offered file name is honoured as a photo, and the directive line is removed', () => {
  assert.deepEqual(
    extractCompanionPhotoDirective('Good morning!\n[photo: window-sun.png]', ['window-sun.png']),
    { body: 'Good morning!', photo: 'window-sun.png' },
  );
  assert.deepEqual(
    extractCompanionPhotoDirective('Look!\n[photo: ../../secret.png]', ['window-sun.png']),
    { body: 'Look!', photo: null },
  );
  assert.deepEqual(
    extractCompanionPhotoDirective('[PHOTO: window-sun.png]', ['window-sun.png']),
    { body: '', photo: 'window-sun.png' },
  );
  assert.deepEqual(
    extractCompanionPhotoDirective('Breakfast!\n[photo: breakfast.jpg]', ['breakfast.JPG']),
    { body: 'Breakfast!', photo: 'breakfast.JPG' },
    'a lower-cased extension still maps back to the offered file',
  );
});

test('the heartbeat prompt offers photos by name and says the Cat cannot see them', () => {
  const prompt = buildCompanionHeartbeatPrompt({
    kind: 'wake',
    now: new Date(2026, 8, 29, 7, 40),
    awakeSince: null,
    lastOwnerMessageAt: null,
    companionContext: null,
    photoCandidates: ['window-sun.png', 'breakfast.JPG'],
  });
  assert.match(prompt, /You cannot see these pictures/u);
  assert.match(prompt, /\[photo: <file name>\]/u);
  assert.match(prompt, /- window-sun\.png\n- breakfast\.JPG/u);
});

test('the photo folder must be an absolute path, and can be cleared', () => {
  const current = normalizeCompanionLifeProfile(undefined, '2026-09-29T00:00:00.000Z');
  assert.equal(current.photoFolder, null);
  assert.equal(validateCompanionLifeUpdate(current, { photoFolder: 'pictures/mochi' }).code, 'invalid_companion_photo_folder');
  assert.deepEqual(validateCompanionLifeUpdate(current, { photoFolder: 'C:\\Photos\\Mochi' }), {
    ok: true,
    update: { photoFolder: 'C:\\Photos\\Mochi' },
  });
  assert.deepEqual(validateCompanionLifeUpdate(current, { photoFolder: '/home/owner/mochi' }).ok, true);
  assert.deepEqual(validateCompanionLifeUpdate(current, { photoFolder: null }), {
    ok: true,
    update: { photoFolder: null },
  });
});

test('Telegram uploads a local photo as multipart form data with its caption', async () => {
  const folder = await createPhotoFolder();
  const requests = [];
  const client = createTelegramBotApiDeliveryClient({
    botToken: 'token-123',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 7, chat: { id: 4242 } } }),
        text: async () => '',
      };
    },
  });

  const result = await client.deliver({
    operation: 'send_media',
    mediaKind: 'photo',
    chatId: '4242',
    mediaFile: { path: path.join(folder, 'window-sun.png'), fileName: 'window-sun.png' },
    caption: 'Good morning!',
  });

  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/bottoken-123\/sendPhoto$/u);
  const contentType = requests[0].init.headers['content-type'];
  assert.match(contentType, /^multipart\/form-data; boundary=/u);
  const body = Buffer.from(requests[0].init.body);
  const text = body.toString('latin1');
  assert.match(text, /name="chat_id"\r\n\r\n4242\r\n/u);
  assert.match(text, /name="caption"\r\n\r\nGood morning!\r\n/u);
  assert.match(text, /name="photo"; filename="window-sun\.png"\r\nContent-Type: image\/png\r\n\r\n/u);
  assert.ok(body.includes(ONE_PIXEL_PNG), 'the image bytes are uploaded as-is');
});
