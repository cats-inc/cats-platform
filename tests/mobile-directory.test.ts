import assert from 'node:assert/strict';
import test from 'node:test';

import { isMembershipEnded, membershipsOfCat } from '../src/shared/directoryMembership.ts';
import {
  formatMobileDirectoryDate,
  getMobileDirectoryCopy,
  mobileDirectoryLoadErrorMessage,
  selectMobileCatteryDetail,
  selectMobileClowderDetail,
  type MobileChatCat,
  type MobileDirectoryView,
} from '../src/mobile/index.ts';

const T = '2026-11-02T00:00:00.000Z';
const NOW = new Date('2026-11-16T12:00:00.000Z');

function cat(id: string, name: string, status: 'active' | 'archived' = 'active'): MobileChatCat {
  return { id, name, group: 'standard', avatarColor: '#E2A86B', createdAt: T, avatarUrl: null, status, products: ['chat'] };
}

const CATS = [cat('mochi', 'Mochi'), cat('tiger', 'Tiger'), cat('tofu', 'Tofu'), cat('old', 'Old', 'archived')];

const DIRECTORY: MobileDirectoryView = {
  catteries: [{
    id: 'acme', name: 'Acme', description: 'The studio', domain: 'acme.com', createdAt: T,
    members: [
      { catId: 'mochi', role: 'owner', status: 'formal', joinedAt: T },
      { catId: 'tofu', role: 'member', status: 'external', joinedAt: T },
    ],
  }],
  clowders: [
    {
      id: 'dev', name: 'Dev', description: null, parentCatteryId: 'acme', createdAt: T,
      members: [
        { catId: 'mochi', role: 'lead', status: 'formal', expiresAt: null, joinedAt: T },
        { catId: 'tiger', role: 'member', status: 'temp', expiresAt: '2026-11-16T00:00:00.000Z', joinedAt: T },
        { catId: 'tofu', role: 'member', status: 'temp', expiresAt: '2026-11-10T00:00:00.000Z', joinedAt: T },
        { catId: 'old', role: 'member', status: 'formal', expiresAt: null, joinedAt: T },
      ],
    },
    { id: 'night', name: 'Night shift', description: null, parentCatteryId: null, createdAt: T, members: [] },
  ],
};

test('an end date is a whole day: still a member on it, ended the day after (SPEC-103 FR-23)', () => {
  assert.equal(isMembershipEnded('temp', '2026-11-16T00:00:00.000Z', NOW), false);
  assert.equal(isMembershipEnded('temp', '2026-11-15T00:00:00.000Z', NOW), true);
  assert.equal(isMembershipEnded('formal', '2026-11-01T00:00:00.000Z', NOW), false);
  assert.equal(isMembershipEnded('temp', null, NOW), false);
});

test('a Cattery counts for a Cat only through its own membership, not one of its Clowders (FR-16)', () => {
  const tiger = membershipsOfCat(DIRECTORY, 'tiger');
  assert.deepEqual(tiger.catteries, []);
  assert.deepEqual(tiger.clowders.map((entry) => entry.group.id), ['dev']);
  const mochi = membershipsOfCat(DIRECTORY, 'mochi');
  assert.deepEqual(mochi.catteries.map((entry) => [entry.group.id, entry.member.role]), [['acme', 'owner']]);
});

test('a Clowder lists its active Cats with their role and any non-formal status, in Desktop wording', () => {
  const detail = selectMobileClowderDetail(DIRECTORY, CATS, 'dev', 'en', NOW);
  assert.ok(detail);
  assert.equal(detail.subtitle, 'Part of Acme');
  assert.deepEqual(detail.cattery, { id: 'acme', name: 'Acme' });
  assert.deepEqual(detail.members.map((member) => [member.name, member.role, member.statusLabel, member.ended]), [
    ['Mochi', 'Lead', null, false],
    ['Tiger', 'Member', 'Temporary until 11/16/2026', false],
    ['Tofu', 'Member', 'Temporary, ended 11/10/2026', true],
  ]);
});

test('a Clowder without a Cattery says so, and zh-TW reads the Desktop catalog', () => {
  const detail = selectMobileClowderDetail(DIRECTORY, CATS, 'night', 'zh-TW', NOW);
  assert.ok(detail);
  assert.equal(detail.subtitle, '跨單位任務小組');
  assert.equal(detail.cattery, null);
  const dev = selectMobileClowderDetail(DIRECTORY, CATS, 'dev', 'zh-TW', NOW);
  assert.equal(dev?.members[2]?.statusLabel, '臨時，2026/11/10 已到期');
  assert.equal(getMobileDirectoryCopy('zh-TW').membersHeading, '成員');
});

test('a Cattery lists its direct members and its Clowders with their Cat counts', () => {
  const detail = selectMobileCatteryDetail(DIRECTORY, CATS, 'acme', 'en', NOW);
  assert.ok(detail);
  assert.equal(detail.domain, 'acme.com');
  assert.deepEqual(detail.members.map((member) => [member.name, member.role, member.statusLabel]), [
    ['Mochi', 'Owner', null],
    ['Tofu', 'Member', 'External'],
  ]);
  // The archived Cat is not counted.
  assert.deepEqual(detail.clowders, [{ id: 'dev', name: 'Dev', detail: '3 cats' }]);
});

test('a group that is gone reads as not found', () => {
  assert.equal(selectMobileClowderDetail(DIRECTORY, CATS, 'missing', 'en', NOW), null);
  assert.equal(selectMobileCatteryDetail(DIRECTORY, CATS, 'missing', 'en', NOW), null);
});

test('end dates match Desktop without the phone Intl, and a refused file says why', () => {
  assert.equal(formatMobileDirectoryDate('2026-12-31T00:00:00.000Z', 'en'), '12/31/2026');
  assert.equal(formatMobileDirectoryDate('2026-12-31T00:00:00.000Z', 'zh-TW'), '2026/12/31');
  assert.equal(
    mobileDirectoryLoadErrorMessage('en', { error: { code: 'directory_newer', message: 'x' } }, 'failed'),
    'The Clowder and Cattery file was saved by a newer version of Cats. Update Cats to open it; the file was left unchanged.',
  );
  assert.equal(
    mobileDirectoryLoadErrorMessage('en', null, 'offline'),
    'Clowders and Catteries could not be loaded: offline',
  );
});
