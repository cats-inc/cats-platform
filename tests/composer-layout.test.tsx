import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ComposerTextarea } from '../src/products/shared/renderer/components/ComposerTextarea.tsx';
import { useAppChrome } from '../src/products/shared/renderer/hooks/useAppChrome.ts';
import { useTranscriptAutoScroll } from '../src/products/shared/renderer/hooks/useTranscriptAutoScroll.ts';
import { clearConversationViewMemory } from '../src/products/shared/renderer/conversationViewMemory.ts';

class LayoutObserver {
  static instances = new Set<LayoutObserver>();
  targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) { LayoutObserver.instances.add(this); }
  observe(target: Element) { this.targets.add(target); }
  disconnect() { LayoutObserver.instances.delete(this); }
  static resize(target: Element) {
    for (const observer of LayoutObserver.instances) {
      if (observer.targets.has(target)) observer.callback([], observer as unknown as ResizeObserver);
    }
  }
}

test('controlled clears, restores, remounts and width changes resize composer textareas and mirrors', (t) => {
  const originalObserver = globalThis.ResizeObserver;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++sequence, callback); return sequence; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); for (const frame of pending) frame(0); };
  // Bundled CI tests share a process: another bundle may have installed the
  // current document after this bundle's DOM helper was first evaluated.
  const prototype = Object.getPrototypeOf(document.createElement('textarea')) as HTMLTextAreaElement;
  const originalHeight = Object.getOwnPropertyDescriptor(prototype, 'scrollHeight');
  const originalWidth = Object.getOwnPropertyDescriptor(prototype, 'clientWidth');
  let width = 600;
  Object.defineProperties(prototype, {
    clientWidth: { configurable: true, get: () => width },
    scrollHeight: { configurable: true, get() {
      return Math.max(44, this.value.split('\n').reduce((lines: number, line: string) =>
        lines + Math.max(1, Math.ceil(line.length / (width / 10))), 0) * 24);
    } },
  });
  globalThis.ResizeObserver = LayoutObserver as unknown as typeof ResizeObserver;
  t.after(() => {
    cleanup(); resetTestDom(); LayoutObserver.instances.clear();
    globalThis.ResizeObserver = originalObserver;
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
    if (originalHeight) Object.defineProperty(prototype, 'scrollHeight', originalHeight);
    else Reflect.deleteProperty(prototype, 'scrollHeight');
    if (originalWidth) Object.defineProperty(prototype, 'clientWidth', originalWidth);
    else Reflect.deleteProperty(prototype, 'clientWidth');
  });
  const forwarded = createRef<HTMLTextAreaElement>();
  function Composer({ value, identity = 'lead' }: { value: string; identity?: string }) {
    const { autoResize } = useAppChrome();
    return <>
      <ComposerTextarea key={identity} ref={forwarded} autoResize={autoResize} value={value} onChange={() => {}} />
      <ComposerTextarea autoResize={autoResize} value={value} readOnly />
    </>;
  }
  const draw = (value: string, identity?: string) => <MemoryRouter><Composer value={value} identity={identity} /></MemoryRouter>;
  const view = render(draw(''));
  const inputs = () => [...view.container.querySelectorAll('textarea')];
  const assertSize = (height: string, overflow: string) => {
    for (const input of inputs()) {
      assert.equal(input.style.height, height);
      assert.equal(input.style.overflowY, overflow);
    }
  };
  assert.equal(forwarded.current, inputs()[0], 'voice input still receives the actual textarea');
  assertSize('44px', 'hidden');
  view.rerender(draw('line\n'.repeat(20)));
  assertSize('200px', 'auto');
  view.rerender(draw('')); // Programmatic clear after send, without an input event.
  assertSize('44px', 'hidden');
  view.rerender(draw('restored\n'.repeat(20)));
  assertSize('200px', 'auto');
  const previous = inputs()[0];
  view.rerender(draw('restored\n'.repeat(20), 'remounted-preset'));
  assert.notEqual(inputs()[0], previous);
  assertSize('200px', 'auto');
  view.rerender(draw('x'.repeat(120)));
  assertSize('48px', 'hidden');
  act(() => { width = 300; for (const input of inputs()) LayoutObserver.resize(input); flush(); });
  assertSize('96px', 'hidden');
  act(() => { width = 600; for (const input of inputs()) LayoutObserver.resize(input); flush(); });
  assertSize('48px', 'hidden');
  act(() => { width = 300; for (const input of inputs()) LayoutObserver.resize(input); });
  view.unmount();
  assert.equal(frames.size, 0, 'unmount cancels pending width measurements');
  assert.equal(forwarded.current, null);
  assert.equal(LayoutObserver.instances.size, 0);
});

test('docking moves the complete composer stack, tracks header growth and clears offsets on shrink', (t) => {
  const originalObserver = globalThis.ResizeObserver;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  globalThis.ResizeObserver = LayoutObserver as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++sequence, callback); return sequence; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  t.after(() => {
    cleanup(); resetTestDom(); clearConversationViewMemory(); LayoutObserver.instances.clear();
    globalThis.ResizeObserver = originalObserver;
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  });
  let stackHeight = 140;
  function Transcript() {
    const refs = useTranscriptAutoScroll({ channelId: 'layout', scrollKey: 'unchanged', scopeKey: 'fixture' });
    return <main className="canvas" ref={(element) => {
      if (!element) return;
      Object.defineProperties(element, {
        clientHeight: { configurable: true, value: 500 },
        scrollHeight: { configurable: true, value: 3000 },
      });
      element.scrollTo = (options) => { element.scrollTop = (options as ScrollToOptions).top ?? 0; };
    }}>
      <div ref={refs.transcriptListRef}>Transcript</div>
      <div className="composerAreaStack" style={{ bottom: 16 }} ref={(element) => {
        if (element) element.getBoundingClientRect = () => ({ height: stackHeight }) as DOMRect;
      }}>
        <div className="composerHeaderRow">cwd / permission</div>
        <form ref={refs.composerCardRef} />
      </div>
      <div className="sentinel" ref={refs.bottomSentinelRef} />
    </main>;
  }
  const view = render(<Transcript />);
  const canvas = view.container.querySelector<HTMLElement>('.canvas')!;
  const stack = view.container.querySelector<HTMLElement>('.composerAreaStack')!;
  const form = view.container.querySelector('form')!;
  const sentinel = view.container.querySelector<HTMLElement>('.sentinel')!;
  act(() => { const pending = [...frames.values()]; frames.clear(); for (const frame of pending) frame(0); });
  canvas.scrollTop = 400;
  fireEvent.scroll(canvas);
  act(() => { stackHeight = 296; LayoutObserver.resize(stack); });
  assert.equal(stack.style.marginTop, '-156px');
  assert.equal(form.style.marginTop, '', 'the card must not move independently of its chips');
  assert.equal(sentinel.style.height, '156px');
  assert.equal(canvas.scrollTop, 400, 'resizing while reading older messages must not jump to the bottom');
  act(() => { stackHeight = 326; LayoutObserver.resize(stack); }); // Header/footer-only growth.
  assert.equal(stack.style.marginTop, '-186px');
  act(() => { stackHeight = 140; LayoutObserver.resize(stack); });
  assert.equal(stack.style.marginTop, '');
  assert.equal(sentinel.style.height, '0px');
  view.unmount();
  assert.equal(stack.style.marginTop, '');
  assert.equal(LayoutObserver.instances.size, 0);
});
