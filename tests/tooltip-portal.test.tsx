import assert from 'node:assert/strict';
import test from 'node:test';

import { initTooltipPortal } from '../src/products/chat/renderer/tooltipPortal.ts';

class FakeClassList {
  private readonly values = new Set<string>();

  add(value: string): void {
    this.values.add(value);
  }

  remove(value: string): void {
    this.values.delete(value);
  }

  contains(value: string): boolean {
    return this.values.has(value);
  }
}

class FakePortalElement {
  className = '';
  textContent = '';
  style: Record<string, string> = {};
  classList = new FakeClassList();
  removed = false;

  getBoundingClientRect() {
    return {
      top: 24,
      right: 120,
      bottom: 40,
      left: 40,
      width: 80,
      height: 16,
    };
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeTooltipTarget {
  constructor(private readonly text: string) {}

  getAttribute(name: string): string | null {
    return name === 'data-tooltip' ? this.text : null;
  }

  getBoundingClientRect() {
    return {
      top: 120,
      right: 220,
      bottom: 156,
      left: 180,
      width: 40,
      height: 36,
    };
  }

  closest(selector: string): FakeTooltipTarget | null {
    return selector === '[data-tooltip]' ? this : null;
  }
}

class FakeDocument {
  readonly body = {
    appendedNodes: [] as FakePortalElement[],
    appendChild: (node: FakePortalElement) => {
      this.body.appendedNodes.push(node);
    },
  };

  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  createElement(): FakePortalElement {
    return new FakePortalElement();
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, target: FakeTooltipTarget): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ target } as unknown as Event);
    }
  }
}

test('tooltip portal hides immediately on click so stale tooltips do not survive navigation', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const documentStub = new FakeDocument();

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentStub,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { innerWidth: 1280 },
  });

  const cleanup = initTooltipPortal();

  try {
    const target = new FakeTooltipTarget('Milo');
    documentStub.dispatch('mouseover', target);

    const portal = documentStub.body.appendedNodes[0];
    assert.ok(portal, 'tooltip portal should be created on hover');
    assert.equal(portal.textContent, 'Milo');
    assert.equal(portal.classList.contains('tooltipVisible'), true);

    documentStub.dispatch('click', target);

    assert.equal(portal.classList.contains('tooltipVisible'), false);
  } finally {
    cleanup();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: previousDocument,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  }
});
