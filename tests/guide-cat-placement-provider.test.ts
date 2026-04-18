import assert from 'node:assert/strict';
import test from 'node:test';

import { observeGuideCatChromeMetric } from '../src/app/renderer/GuideCatPlacementProvider.tsx';

class FakeMeasuredElement {
  isConnected = false;

  constructor(
    private rect: { right: number; bottom: number },
  ) {}

  setRect(next: { right: number; bottom: number }): void {
    this.rect = next;
  }

  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: this.rect.right,
      bottom: this.rect.bottom,
      width: this.rect.right,
      height: this.rect.bottom,
      toJSON() {
        return this;
      },
    } as DOMRect;
  }
}

class FakeDocument {
  readonly body = {};
  readonly documentElement = this.body;
  private readonly nodes = new Map<string, FakeMeasuredElement | null>();

  setNode(selector: string, node: FakeMeasuredElement | null): void {
    const previous = this.nodes.get(selector);
    if (previous) {
      previous.isConnected = false;
    }
    if (node) {
      node.isConnected = true;
    }
    this.nodes.set(selector, node);
  }

  querySelector<T extends HTMLElement>(selector: string): T | null {
    return (this.nodes.get(selector) ?? null) as T | null;
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  target: unknown = null;

  constructor(
    private readonly callback: MutationCallback,
  ) {
    FakeMutationObserver.instances.push(this);
  }

  observe(target: unknown): void {
    this.target = target;
  }

  disconnect(): void {}

  flush(): void {
    this.callback([], this as unknown as MutationObserver);
  }

  static flushFor(target: unknown): void {
    FakeMutationObserver.instances
      .filter((instance) => instance.target === target)
      .forEach((instance) => instance.flush());
  }

  static flushAll(): void {
    FakeMutationObserver.instances.forEach((instance) => instance.flush());
  }

  static reset(): void {
    FakeMutationObserver.instances = [];
  }
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  target: unknown = null;

  constructor(
    private readonly callback: ResizeObserverCallback,
  ) {
    FakeResizeObserver.instances.push(this);
  }

  observe(target: unknown): void {
    this.target = target;
  }

  disconnect(): void {}

  flush(): void {
    this.callback([], this as unknown as ResizeObserver);
  }

  static flushFor(target: unknown): void {
    FakeResizeObserver.instances
      .filter((instance) => instance.target === target)
      .forEach((instance) => instance.flush());
  }

  static reset(): void {
    FakeResizeObserver.instances = [];
  }
}

async function withGuideCatChromeObserverHarness(
  run: () => Promise<void> | void,
): Promise<void> {
  const originalMutationObserver = globalThis.MutationObserver;
  const originalResizeObserver = globalThis.ResizeObserver;

  globalThis.MutationObserver = FakeMutationObserver as unknown as typeof MutationObserver;
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  FakeMutationObserver.reset();
  FakeResizeObserver.reset();

  try {
    await run();
  } finally {
    globalThis.MutationObserver = originalMutationObserver;
    globalThis.ResizeObserver = originalResizeObserver;
    FakeMutationObserver.reset();
    FakeResizeObserver.reset();
  }
}

test('observeGuideCatChromeMetric tracks late-mounted sidebar chrome and resize updates', async () => {
  await withGuideCatChromeObserverHarness(() => {
    const document = new FakeDocument();
    const observed: Array<number | null> = [];
    const cleanup = observeGuideCatChromeMetric({
      document: document as unknown as Document,
      selector: 'aside.sidebar',
      readValue: (node) => node ? Math.round(node.getBoundingClientRect().right) : null,
      onChange: (value) => {
        observed.push(value);
      },
    });

    assert.deepEqual(observed, [null]);

    const sidebar = new FakeMeasuredElement({ right: 240, bottom: 600 });
    document.setNode('aside.sidebar', sidebar);
    FakeMutationObserver.flushAll();
    assert.equal(observed.at(-1), 240);

    sidebar.setRect({ right: 288, bottom: 600 });
    FakeResizeObserver.flushFor(sidebar);
    assert.equal(observed.at(-1), 288);

    document.setNode('aside.sidebar', null);
    FakeMutationObserver.flushAll();
    assert.equal(observed.at(-1), null);

    cleanup();
  });
});

test('observeGuideCatChromeMetric ignores unrelated tree mutations after the target is connected', async () => {
  await withGuideCatChromeObserverHarness(() => {
    const document = new FakeDocument();
    const observed: Array<number | null> = [];
    const sidebar = new FakeMeasuredElement({ right: 240, bottom: 600 });
    document.setNode('aside.sidebar', sidebar);

    const cleanup = observeGuideCatChromeMetric({
      document: document as unknown as Document,
      selector: 'aside.sidebar',
      readValue: (node) => node ? Math.round(node.getBoundingClientRect().right) : null,
      onChange: (value) => {
        observed.push(value);
      },
    });

    assert.deepEqual(observed, [240]);
    FakeMutationObserver.flushFor(document.body);
    assert.deepEqual(observed, [240]);

    cleanup();
  });
});
