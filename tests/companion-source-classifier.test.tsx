import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCompanionSource,
} from '../src/products/chat/companion/sourceClassifier.ts';

test('SVG is classified as file even when MIME starts with image/', () => {
  assert.equal(
    classifyCompanionSource({ kind: 'image', mimeType: 'image/svg+xml' }),
    'file',
  );
  assert.equal(
    classifyCompanionSource({ kind: 'image', originalFileName: 'logo.svg' }),
    'file',
  );
});

test('image MIMEs and recognized photo extensions land in Photos', () => {
  assert.equal(
    classifyCompanionSource({ kind: 'image', mimeType: 'image/jpeg' }),
    'photo',
  );
  assert.equal(
    classifyCompanionSource({ kind: 'note', originalFileName: 'beach.HEIC' }),
    'photo',
  );
  assert.equal(
    classifyCompanionSource({ kind: 'note', originalFileName: 'snap.PNG' }),
    'photo',
  );
});

test('video MIMEs and extensions land in Videos', () => {
  assert.equal(
    classifyCompanionSource({ kind: 'video', mimeType: 'video/mp4' }),
    'video',
  );
  assert.equal(
    classifyCompanionSource({ kind: 'note', originalFileName: 'clip.mov' }),
    'video',
  );
});

test('audio MIMEs and extensions land in Music', () => {
  assert.equal(
    classifyCompanionSource({ kind: 'audio', mimeType: 'audio/mpeg' }),
    'music',
  );
  assert.equal(
    classifyCompanionSource({ kind: 'note', originalFileName: 'track.flac' }),
    'music',
  );
});

test('PDF, Markdown, CSV, JSON, and ZIP variants land in Files', () => {
  for (const mime of [
    'application/pdf',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/zip',
    'application/x-zip-compressed',
  ]) {
    assert.equal(classifyCompanionSource({ kind: 'note', mimeType: mime }), 'file', mime);
  }
  for (const filename of [
    'doc.PDF', 'notes.md', 'notes.markdown', 'data.CSV',
    'data.tsv', 'config.json', 'archive.zip', 'archive.tar', 'log.gz',
  ]) {
    assert.equal(
      classifyCompanionSource({ kind: 'note', originalFileName: filename }),
      'file',
      filename,
    );
  }
});

test('octet-stream with a recognized extension reclassifies via that extension', () => {
  assert.equal(
    classifyCompanionSource({
      kind: 'note',
      mimeType: 'application/octet-stream',
      originalFileName: 'photo.jpg',
    }),
    'photo',
  );
  assert.equal(
    classifyCompanionSource({
      kind: 'note',
      mimeType: 'application/octet-stream',
      originalFileName: 'doc.pdf',
    }),
    'file',
  );
});

test('octet-stream without a recognized extension lands in Files as unknown binary', () => {
  assert.equal(
    classifyCompanionSource({
      kind: 'note',
      mimeType: 'application/octet-stream',
      originalFileName: 'mystery.bin',
    }),
    'file',
  );
  assert.equal(
    classifyCompanionSource({
      kind: 'note',
      mimeType: 'application/octet-stream',
    }),
    'file',
  );
});

test('path_ref with a media extension in linkedPath classifies as the matching media tab', () => {
  assert.equal(
    classifyCompanionSource({
      kind: 'path_ref',
      linkedPath: '/Users/me/photos/snap.png',
    }),
    'photo',
  );
  assert.equal(
    classifyCompanionSource({
      kind: 'path_ref',
      sourceUrl: 'https://example.com/clip.mp4',
    }),
    'video',
  );
});

test('path_ref with no recognized extension or MIME lands in Files as unknown linked file', () => {
  assert.equal(
    classifyCompanionSource({
      kind: 'path_ref',
      linkedPath: '/Users/me/folder/notes-without-extension',
    }),
    'file',
  );
});

test('plain notes / articles / conversation logs without files land in source_only', () => {
  for (const kind of ['note', 'article', 'conversation_log']) {
    assert.equal(classifyCompanionSource({ kind }), 'source_only', kind);
  }
});

test('unknown kind with no signal falls through to source_only', () => {
  assert.equal(
    classifyCompanionSource({ kind: 'completely_made_up' }),
    'source_only',
  );
});

test('classifier ignores case on extension and MIME comparisons', () => {
  assert.equal(
    classifyCompanionSource({
      kind: 'note',
      mimeType: 'IMAGE/JPEG',
      originalFileName: 'snap.JPG',
    }),
    'photo',
  );
  assert.equal(
    classifyCompanionSource({
      kind: 'note',
      mimeType: 'APPLICATION/PDF',
      originalFileName: 'notes.PDF',
    }),
    'file',
  );
});
