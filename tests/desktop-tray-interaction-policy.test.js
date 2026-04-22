import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDesktopTrayInteractionPolicy } from '../build/desktop/trayInteractionPolicy.js';

test('desktop tray interactions keep left-click reveal and right-click menu across platforms', () => {
  const platforms = [
    ['darwin', 'manual-right-click-popup'],
    ['win32', 'native-context-menu'],
    ['linux', 'native-context-menu'],
  ];

  for (const [platform, contextMenuBinding] of platforms) {
    assert.deepEqual(
      resolveDesktopTrayInteractionPolicy(platform),
      {
        contextMenuBinding,
        singleLeftClick: 'show-window',
        doubleLeftClick: 'show-window',
        singleRightClick: 'show-context-menu',
      },
    );
  }
});
