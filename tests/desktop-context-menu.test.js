import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopContextMenuTemplate } from '../build/desktop/contextMenu.js';

function params(overrides = {}) {
  return {
    isEditable: false,
    selectionText: '',
    ...overrides,
    editFlags: {
      canUndo: false,
      canRedo: false,
      canCut: false,
      canCopy: false,
      canPaste: false,
      canSelectAll: true,
      ...overrides.editFlags,
    },
  };
}

function roles(template) {
  return template.map((item) => item.role ?? item.type);
}

test('selected read-only text offers a single copy item', () => {
  const template = buildDesktopContextMenuTemplate(
    params({ selectionText: 'hello', editFlags: { canCopy: true } }),
    'en-US',
  );
  assert.deepEqual(template, [{ role: 'copy', label: 'Copy', enabled: true }]);
});

test('plain content without a selection shows no menu', () => {
  assert.deepEqual(buildDesktopContextMenuTemplate(params({ selectionText: '  ' }), 'en'), []);
});

test('editable fields offer the edit commands gated by edit flags', () => {
  const template = buildDesktopContextMenuTemplate(
    params({ isEditable: true, editFlags: { canPaste: true } }),
    'en',
  );
  assert.deepEqual(roles(template), [
    'undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'separator', 'selectAll',
  ]);
  const enabled = Object.fromEntries(
    template.filter((item) => item.role).map((item) => [item.role, item.enabled]),
  );
  assert.deepEqual(enabled, {
    undo: false, redo: false, cut: false, copy: false, paste: true, selectAll: true,
  });
});

test('traditional Chinese locales get localized labels', () => {
  const template = buildDesktopContextMenuTemplate(
    params({ selectionText: 'hi', editFlags: { canCopy: true } }),
    'zh-TW',
  );
  assert.equal(template[0].label, '複製');
});
