import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  extractCompanionPhotoDirective,
  resolveCompanionAlbumPhoto,
} from '../build/server/products/chat/companion/life/photos.js';
import {
  normalizeCompanionLifeProfile,
  validateCompanionLifeUpdate,
} from '../build/server/products/chat/companion/life/profile.js';
import { buildCompanionHeartbeatPrompt } from '../build/server/products/chat/companion/life/heartbeat.js';
import { formatCompanionContext } from '../build/server/products/chat/state/prompts.js';
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
  await mkdir(path.join(folder, 'trips', 'beach'), { recursive: true });
  await writeFile(path.join(folder, 'trips', 'beach', 'sunset.webp'), ONE_PIXEL_PNG);
  return folder;
}

test('the photo directive is removed from the reply and the first path is returned', () => {
  assert.deepEqual(
    extractCompanionPhotoDirective('Good morning!\n[photo: window-sun.png]'),
    { body: 'Good morning!', requested: 'window-sun.png' },
  );
  assert.deepEqual(
    extractCompanionPhotoDirective('[PHOTO:  trips/beach/sunset.webp ]\nLook!\n[photo: other.png]'),
    { body: 'Look!', requested: 'trips/beach/sunset.webp' },
  );
  assert.deepEqual(
    extractCompanionPhotoDirective('No photo today, see [photo: inline] mid-sentence.'),
    { body: 'No photo today, see [photo: inline] mid-sentence.', requested: null },
    'only a line of its own is a directive',
  );
});

test('any image under the album resolves, including subfolders and absolute paths inside it', async () => {
  const album = await createPhotoFolder();
  const sunset = await resolveCompanionAlbumPhoto(album, 'trips/beach/sunset.webp');
  assert.equal(sunset?.sourcePath, await realpath(path.join(album, 'trips', 'beach', 'sunset.webp')));
  assert.equal(sunset?.fileName, 'sunset.webp');
  const absolute = await resolveCompanionAlbumPhoto(album, path.join(album, 'window-sun.png'));
  assert.equal(absolute?.fileName, 'window-sun.png');
  const lowerCased = await resolveCompanionAlbumPhoto(album, 'breakfast.jpg');
  assert.equal(lowerCased?.fileName.toLowerCase(), 'breakfast.jpg', 'a lower-cased extension still finds the file');
});

test('nothing outside the album, and nothing but a sendable image, is ever resolved', async () => {
  const album = await createPhotoFolder();
  const outside = await mkdtemp(path.join(tmpdir(), 'cats-companion-outside-'));
  await writeFile(path.join(outside, 'secret.png'), ONE_PIXEL_PNG);
  const oversize = path.join(album, 'huge.jpg');
  await writeFile(oversize, '');
  await truncate(oversize, 10 * 1024 * 1024 + 1);

  assert.equal(await resolveCompanionAlbumPhoto(album, path.relative(album, path.join(outside, 'secret.png'))), null);
  assert.equal(await resolveCompanionAlbumPhoto(album, path.join(outside, 'secret.png')), null);
  assert.equal(await resolveCompanionAlbumPhoto(album, 'notes.txt'), null);
  assert.equal(await resolveCompanionAlbumPhoto(album, 'nested.png'), null, 'a folder is not a photo');
  assert.equal(await resolveCompanionAlbumPhoto(album, 'huge.jpg'), null, 'over the Telegram upload limit');
  assert.equal(await resolveCompanionAlbumPhoto(album, 'missing.png'), null);
  assert.equal(await resolveCompanionAlbumPhoto(album, '.'), null);
  assert.equal(await resolveCompanionAlbumPhoto(null, 'window-sun.png'), null);
  assert.equal(await resolveCompanionAlbumPhoto(path.join(album, 'missing'), 'window-sun.png'), null);
});

test('a link inside the album that points outside it is not followed', async (t) => {
  const album = await createPhotoFolder();
  const outside = await mkdtemp(path.join(tmpdir(), 'cats-companion-outside-'));
  await writeFile(path.join(outside, 'secret.png'), ONE_PIXEL_PNG);
  // A junction needs no privilege on Windows; a file symlink may.
  await symlink(outside, path.join(album, 'shortcut'), 'junction');
  assert.equal(await resolveCompanionAlbumPhoto(album, 'shortcut/secret.png'), null);
  try {
    await symlink(path.join(outside, 'secret.png'), path.join(album, 'innocent.png'));
  } catch (error) {
    t.diagnostic(`file symlinks unavailable here: ${error.code}`);
    return;
  }
  assert.equal(await resolveCompanionAlbumPhoto(album, 'innocent.png'), null);
});

test('the heartbeat prompt nudges toward the album without listing photos', () => {
  const prompt = buildCompanionHeartbeatPrompt({
    kind: 'wake',
    now: new Date(2026, 8, 29, 7, 40),
    awakeSince: null,
    lastOwnerMessageAt: null,
    companionContext: null,
    hasPhotoAlbum: true,
  });
  assert.match(prompt, /a photo from your album fits the moment/u);
  assert.doesNotMatch(prompt, /cannot see these pictures/u);
  assert.doesNotMatch(
    buildCompanionHeartbeatPrompt({
      kind: 'wake',
      now: new Date(2026, 8, 29, 7, 40),
      awakeSince: null,
      lastOwnerMessageAt: null,
      companionContext: null,
    }),
    /album/u,
  );
});

test('only a companion Cat is told where its album is and how to send from it', () => {
  const context = {
    memory: [],
    ownerNotes: [],
    responseProfile: { expressionMode: 'unknown-mode' },
    photoAlbum: '/home/owner/mochi',
  };
  const companion = formatCompanionContext(context, true);
  assert.match(companion, /Your photo album: \/home\/owner\/mochi/u);
  assert.match(companion, /read-only for you/u);
  assert.match(companion, /\[photo: <path relative to the album>\]/u);
  assert.equal(formatCompanionContext(context, false), null);
  assert.equal(formatCompanionContext({ ...context, photoAlbum: null }, true), null);
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
