import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProductSidebarState,
  isProductSidebarOpen,
  setProductSidebarOpen,
  syncProductSidebarSplitView,
} from '../src/products/shared/renderer/hooks/productSidebarState.ts';

test('opening a canvas collapses an open sidebar and closing it restores the sidebar', () => {
  const open = createProductSidebarState(true, false);
  assert.equal(isProductSidebarOpen(open), true);

  const split = syncProductSidebarSplitView(open, true);
  assert.equal(isProductSidebarOpen(split), false);
  assert.equal(split.preferenceOpen, true, 'auto-collapse must not change the saved preference');

  const closed = syncProductSidebarSplitView(split, false);
  assert.equal(isProductSidebarOpen(closed), true);
});

test('a canvas URL loaded directly starts with the sidebar collapsed', () => {
  const state = createProductSidebarState(true, true);
  assert.equal(isProductSidebarOpen(state), false);
  assert.equal(isProductSidebarOpen(syncProductSidebarSplitView(state, false)), true);
});

test('a sidebar the user already collapsed stays collapsed through split view', () => {
  const collapsed = createProductSidebarState(false, false);
  const split = syncProductSidebarSplitView(collapsed, true);
  assert.equal(isProductSidebarOpen(split), false);
  assert.equal(split.autoCollapsed, false);
  assert.equal(isProductSidebarOpen(syncProductSidebarSplitView(split, false)), false);
});

test('expanding the sidebar during split view is respected until the next canvas opens', () => {
  const split = syncProductSidebarSplitView(createProductSidebarState(true, false), true);
  const expanded = setProductSidebarOpen(split, true);
  assert.equal(isProductSidebarOpen(expanded), true);

  // Staying in split view, e.g. switching artifacts, does not collapse it again.
  assert.equal(syncProductSidebarSplitView(expanded, true), expanded);

  const closed = syncProductSidebarSplitView(expanded, false);
  assert.equal(isProductSidebarOpen(closed), true);
  assert.equal(isProductSidebarOpen(syncProductSidebarSplitView(closed, true)), false);
});

test('collapsing the sidebar during split view becomes the saved preference', () => {
  const split = syncProductSidebarSplitView(createProductSidebarState(false, false), true);
  const expanded = setProductSidebarOpen(split, true);
  assert.equal(expanded.preferenceOpen, true);

  const collapsed = setProductSidebarOpen(expanded, false);
  assert.equal(collapsed.preferenceOpen, false);
  assert.equal(isProductSidebarOpen(syncProductSidebarSplitView(collapsed, false)), false);
});

test('unchanged inputs return the same state object', () => {
  const state = createProductSidebarState(true, false);
  assert.equal(syncProductSidebarSplitView(state, false), state);
  assert.equal(setProductSidebarOpen(state, true), state);
});
