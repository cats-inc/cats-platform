import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fillMobileCopy,
  findCreatedMobileGroupId,
  getMobileDirectoryEditCopy,
  mobileDeleteGroupConfirmCopy,
  mobileDirectoryRequests,
  mobileDirectorySaveError,
  parseMobileEndDate,
  selectMobileAddableCats,
  selectMobileMoveTargets,
  toMobileEndDateText,
  type MobileChatCat,
  type MobileDirectoryView,
} from '../src/mobile/index.ts';

const T = '2026-11-02T00:00:00.000Z';

function cat(id: string, name: string, status: 'active' | 'archived' = 'active'): MobileChatCat {
  return { id, name, group: 'standard', avatarColor: null, createdAt: T, avatarUrl: null, status, products: ['chat'] };
}

const CATS = [cat('mochi', 'Mochi'), cat('tiger', 'Tiger'), cat('tofu', 'Tofu'), cat('old', 'Old', 'archived')];

const DIRECTORY: MobileDirectoryView = {
  catteries: [
    {
      id: 'acme', name: 'Acme', description: null, domain: null, createdAt: T,
      members: [{ catId: 'tofu', role: 'member', status: 'formal', joinedAt: T }],
    },
    { id: 'beta', name: 'Beta', description: null, domain: null, createdAt: T, members: [] },
  ],
  clowders: [
    {
      id: 'dev', name: 'Dev', description: null, parentCatteryId: 'acme', createdAt: T,
      members: [
        { catId: 'mochi', role: 'lead', status: 'formal', expiresAt: null, joinedAt: T },
        { catId: 'old', role: 'member', status: 'formal', expiresAt: null, joinedAt: T },
      ],
    },
    {
      id: 'ops', name: 'Ops', description: null, parentCatteryId: 'acme', createdAt: T,
      members: [{ catId: 'mochi', role: 'member', status: 'formal', expiresAt: null, joinedAt: T }],
    },
    { id: 'design', name: 'Design', description: null, parentCatteryId: 'beta', createdAt: T, members: [] },
    {
      id: 'night', name: 'Night shift', description: null, parentCatteryId: null, createdAt: T,
      members: [{ catId: 'tiger', role: 'member', status: 'formal', expiresAt: null, joinedAt: T }],
    },
  ],
};

test('requests are the ones Desktop sends, with ids encoded', () => {
  assert.deepEqual(
    mobileDirectoryRequests.createClowder({ name: 'Dev', description: null, parentCatteryId: 'acme' }),
    { method: 'POST', path: '/api/platform/clowders', body: { name: 'Dev', description: null, parentCatteryId: 'acme' } },
  );
  assert.deepEqual(mobileDirectoryRequests.updateGroup('cattery', 'a/b', { domain: 'acme.com' }), {
    method: 'PATCH', path: '/api/platform/catteries/a%2Fb', body: { domain: 'acme.com' },
  });
  assert.deepEqual(mobileDirectoryRequests.deleteGroup('clowder', 'dev'), { method: 'DELETE', path: '/api/platform/clowders/dev' });
  assert.deepEqual(mobileDirectoryRequests.addMember('clowder', 'dev', 'tiger'), {
    method: 'POST', path: '/api/platform/clowders/dev/members', body: { catId: 'tiger' },
  });
  assert.deepEqual(mobileDirectoryRequests.updateClowderMember('dev', 'mochi', { status: 'temp', expiresAt: '2027-01-15' }), {
    method: 'PATCH', path: '/api/platform/clowders/dev/members/mochi', body: { status: 'temp', expiresAt: '2027-01-15' },
  });
  assert.deepEqual(mobileDirectoryRequests.removeMember('cattery', 'acme', 'tofu'), {
    method: 'DELETE', path: '/api/platform/catteries/acme/members/tofu',
  });
  assert.deepEqual(mobileDirectoryRequests.moveClowderMember('dev', 'mochi', 'night'), {
    method: 'POST', path: '/api/platform/clowders/dev/members/mochi/move', body: { toClowderId: 'night' },
  });
});

test('a typed end date must be a real YYYY-MM-DD day, and empty means none', () => {
  assert.deepEqual(parseMobileEndDate(''), { ok: true, value: null });
  assert.deepEqual(parseMobileEndDate(' 2027-01-15 '), { ok: true, value: '2027-01-15' });
  assert.deepEqual(parseMobileEndDate('2028-02-29'), { ok: true, value: '2028-02-29' });
  assert.deepEqual(parseMobileEndDate('2027-02-29'), { ok: false });
  assert.deepEqual(parseMobileEndDate('2027-13-01'), { ok: false });
  assert.deepEqual(parseMobileEndDate('1/15/2027'), { ok: false });
  assert.equal(toMobileEndDateText('2027-01-15T00:00:00.000Z'), '2027-01-15');
  assert.equal(toMobileEndDateText(null), '');
});

test('only active Cats not already in the group can be added', () => {
  assert.deepEqual(selectMobileAddableCats(DIRECTORY, CATS, 'clowder', 'dev').map((entry) => entry.id), ['tiger', 'tofu']);
  assert.deepEqual(selectMobileAddableCats(DIRECTORY, CATS, 'cattery', 'acme').map((entry) => entry.id), ['mochi', 'tiger']);
});

test('move targets leave out the source, sit under their Cattery, and mark where the Cat already is', () => {
  const groups = selectMobileMoveTargets(DIRECTORY, CATS, 'dev', 'mochi', 'en');
  assert.deepEqual(groups.map((group) => [group.label, group.targets.map((target) => [target.id, target.alreadyIn, target.detail])]), [
    ['Acme', [['ops', true, '1 cats']]],
    ['Beta', [['design', false, '0 cats']]],
    ['Cross-unit task force', [['night', false, '1 cats']]],
  ]);
});

test('deleting a group says its Cats stay, counting only active ones (FR-24)', () => {
  assert.deepEqual(mobileDeleteGroupConfirmCopy(DIRECTORY, CATS, 'clowder', 'dev', 'zh-TW'), {
    title: '刪除「Dev」？',
    message: '1 隻貓咪都會留著，只是不再在這個貓群。',
    confirm: '刪除貓群',
  });
  const cattery = mobileDeleteGroupConfirmCopy(DIRECTORY, CATS, 'cattery', 'acme', 'zh-TW');
  assert.equal(cattery?.message, '2 隻貓咪和底下的 2 個貓群都會留著，只是不再屬於Acme。');
  assert.equal(mobileDeleteGroupConfirmCopy(DIRECTORY, CATS, 'clowder', 'gone', 'en'), null);
});

test('a refused change explains itself, and a group removed elsewhere sends the screen back', () => {
  assert.deepEqual(mobileDirectorySaveError('en', { error: { code: 'clowder_not_found', message: 'x' } }, 'failed'), {
    message: 'Clowder not found', gone: true,
  });
  assert.equal(mobileDirectorySaveError('en', { error: { code: 'membership_not_found' } }, 'failed').gone, false);
  assert.equal(
    mobileDirectorySaveError('zh-TW', { error: { code: 'directory_name_required' } }, 'failed').message,
    '請輸入名稱。',
  );
  assert.equal(
    mobileDirectorySaveError('en', { error: { code: 'duplicate_member', message: 'Already a member.' } }, 'failed').message,
    'Not saved: Already a member.',
  );
});

test('the created group is the new one, else the newest', () => {
  const after: MobileDirectoryView = {
    ...DIRECTORY,
    clowders: [...DIRECTORY.clowders, { id: 'new', name: 'New', description: null, parentCatteryId: null, createdAt: T, members: [] }],
  };
  assert.equal(findCreatedMobileGroupId(DIRECTORY, after, 'clowder'), 'new');
  assert.equal(findCreatedMobileGroupId(null, after, 'clowder'), 'new');
  assert.equal(findCreatedMobileGroupId(DIRECTORY, DIRECTORY, 'cattery'), 'beta');
});

test('edit copy reads Desktop wording and fills its placeholders', () => {
  const zh = getMobileDirectoryEditCopy('zh-TW');
  assert.equal(zh.makeLead, '設為負責人');
  assert.equal(fillMobileCopy(zh.moveConfirmMove, { group: 'Ops' }), '移到「Ops」');
  assert.equal(fillMobileCopy(zh.newClowderInCattery, { name: 'Acme' }), '在Acme新增貓群');
  assert.equal(getMobileDirectoryEditCopy('en').cancelAction, 'Cancel');
});
