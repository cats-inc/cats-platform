import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPanelEffectivelyVisible,
  readSidePanelRightBlockedLeft,
} from '../src/app/renderer/guideCatPanelDetection.ts';

interface FakePanelOptions {
  position: 'side' | 'bottom';
  pinned?: boolean;
  left?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  throwOnVisibilityCheck?: boolean;
}

function makeFakePanel(options: FakePanelOptions): HTMLElement {
  const {
    position,
    pinned = false,
    left = 800,
    width = 360,
    height = 600,
    visible = true,
    throwOnVisibilityCheck = false,
  } = options;
  const attrs: Record<string, string> = {
    'data-side-panel-position': position,
  };
  if (pinned) attrs['data-side-panel-pinned'] = 'true';
  const panel = {
    getAttribute: (name: string) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name: string) => name in attrs,
    getBoundingClientRect: () => ({
      left,
      top: 0,
      right: left + width,
      bottom: height,
      width,
      height,
    }),
    checkVisibility: (_opts?: unknown) => {
      if (throwOnVisibilityCheck) throw new Error('checkVisibility unavailable');
      return visible;
    },
  };
  return panel as unknown as HTMLElement;
}

function makeFakeDocument(panels: HTMLElement[]): Document {
  return {
    querySelectorAll: (selector: string) => {
      const matchAll = selector === '[data-side-panel-position="side"]';
      const matchPinned =
        selector === '[data-side-panel-position="side"][data-side-panel-pinned="true"]';
      if (!matchAll && !matchPinned) {
        throw new Error(`unexpected selector: ${selector}`);
      }
      return panels.filter((panel) => {
        const pos = panel.getAttribute('data-side-panel-position');
        if (pos !== 'side') return false;
        if (matchPinned) {
          return panel.getAttribute('data-side-panel-pinned') === 'true';
        }
        return true;
      });
    },
  } as unknown as Document;
}

test('readSidePanelRightBlockedLeft returns the minimum left of visible side panels', () => {
  const doc = makeFakeDocument([
    makeFakePanel({ position: 'side', left: 900 }),
    makeFakePanel({ position: 'side', left: 840 }),
  ]);
  assert.equal(readSidePanelRightBlockedLeft(doc), 840);
});

test('readSidePanelRightBlockedLeft ignores bottom-position panels so they never clamp the pill', () => {
  const doc = makeFakeDocument([
    makeFakePanel({ position: 'bottom', left: 0, width: 1200, height: 400 }),
  ]);
  assert.equal(readSidePanelRightBlockedLeft(doc), null);
});

test('readSidePanelRightBlockedLeft drops panels that checkVisibility reports as hidden', () => {
  const doc = makeFakeDocument([
    makeFakePanel({ position: 'side', left: 800, visible: false }),
  ]);
  assert.equal(readSidePanelRightBlockedLeft(doc), null);
});

test('readSidePanelRightBlockedLeft returns null when the document has no side panel', () => {
  const doc = makeFakeDocument([]);
  assert.equal(readSidePanelRightBlockedLeft(doc), null);
});

test('readSidePanelRightBlockedLeft pinnedOnly returns null when only dismissible panels are present', () => {
  const doc = makeFakeDocument([
    makeFakePanel({ position: 'side', left: 800, pinned: false }),
  ]);
  assert.equal(readSidePanelRightBlockedLeft(doc, { pinnedOnly: true }), null);
});

test('readSidePanelRightBlockedLeft pinnedOnly keeps pinned panels in the predicted safe area', () => {
  const doc = makeFakeDocument([
    makeFakePanel({ position: 'side', left: 800, pinned: false }),
    makeFakePanel({ position: 'side', left: 900, pinned: true }),
  ]);
  assert.equal(readSidePanelRightBlockedLeft(doc, { pinnedOnly: true }), 900);
});

test('readSidePanelRightBlockedLeft pinnedOnly still respects visibility on pinned panels', () => {
  const doc = makeFakeDocument([
    makeFakePanel({ position: 'side', left: 900, pinned: true, visible: false }),
  ]);
  assert.equal(readSidePanelRightBlockedLeft(doc, { pinnedOnly: true }), null);
});

test('isPanelEffectivelyVisible defers to checkVisibility when it returns true', () => {
  const panel = makeFakePanel({ position: 'side', visible: true });
  assert.equal(isPanelEffectivelyVisible(panel), true);
});

test('isPanelEffectivelyVisible defers to checkVisibility when it returns false', () => {
  const panel = makeFakePanel({ position: 'side', visible: false });
  assert.equal(isPanelEffectivelyVisible(panel), false);
});

test('isPanelEffectivelyVisible falls back when checkVisibility throws and no computed style is reachable', () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: undefined,
  });
  try {
    const panel = makeFakePanel({ position: 'side', throwOnVisibilityCheck: true });
    assert.equal(isPanelEffectivelyVisible(panel), true);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  }
});

test('isPanelEffectivelyVisible uses getComputedStyle when checkVisibility is absent', () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      getComputedStyle: () => ({
        display: 'block',
        visibility: 'hidden',
        opacity: '1',
      }),
    },
  });
  try {
    const panel = makeFakePanel({ position: 'side' });
    delete (panel as unknown as { checkVisibility?: unknown }).checkVisibility;
    assert.equal(isPanelEffectivelyVisible(panel), false);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  }
});

test('isPanelEffectivelyVisible flags zero-opacity panels via the computed-style fallback', () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      getComputedStyle: () => ({
        display: 'block',
        visibility: 'visible',
        opacity: '0',
      }),
    },
  });
  try {
    const panel = makeFakePanel({ position: 'side' });
    delete (panel as unknown as { checkVisibility?: unknown }).checkVisibility;
    assert.equal(isPanelEffectivelyVisible(panel), false);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  }
});
