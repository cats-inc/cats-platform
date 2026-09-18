import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useTranscriptAutoScroll } from '../src/products/shared/renderer/hooks/useTranscriptAutoScroll.ts';
import { clearConversationViewMemory, rememberConversationScroll } from '../src/products/shared/renderer/conversationViewMemory.ts';

test('restores conversation scroll and cancels the previous conversation animation frame', (t) => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const oldRequest = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  t.after(() => { cleanup(); clearConversationViewMemory(); resetTestDom(); globalThis.requestAnimationFrame = oldRequest; globalThis.cancelAnimationFrame = oldCancel; });
  function Transcript({ id }: { id: string }) {
    const refs = useTranscriptAutoScroll({ channelId: id, scopeKey: 'scroll-test', scrollKey: id });
    return <div className="canvas" ref={(element) => {
      if (!element) return;
      Object.defineProperties(element, { scrollHeight: { value: 3000, configurable: true }, clientHeight: { value: 500, configurable: true } });
      element.scrollTo = (options) => { element.scrollTop = (options as ScrollToOptions).top ?? 0; };
    }}><div ref={refs.transcriptListRef}>Transcript {id}</div><div ref={refs.bottomSentinelRef} /></div>;
  }
  rememberConversationScroll('scroll-test', 'b', { top: 222, nearBottom: false });
  const view = render(<Transcript id="a" />);
  assert.ok(frames.size > 0, 'A has a pending scroll-to-bottom frame');
  view.rerender(<Transcript id="b" />);
  const canvas = view.container.querySelector<HTMLElement>('.canvas')!;
  act(() => { const callbacks = [...frames.values()]; frames.clear(); for (const frame of callbacks) frame(0); });
  assert.equal(canvas.scrollTop, 222, 'A cannot scroll B after its retained position was restored');
  canvas.scrollTop = 444;
  fireEvent.scroll(canvas);
  view.rerender(<Transcript id="a" />);
  view.rerender(<Transcript id="b" />);
  assert.equal(canvas.scrollTop, 444);
});
