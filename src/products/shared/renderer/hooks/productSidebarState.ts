/**
 * Product shell sidebar state.
 *
 * The persisted preference is what the user chose. Artifact Canvas split view
 * collapses the sidebar to its rail for as long as the canvas stays open,
 * without touching that preference, so closing the canvas restores it. A user
 * who expands the sidebar during split view keeps it expanded until the next
 * time a canvas opens.
 */
export interface ProductSidebarState {
  /** The user's choice; the only part written to localStorage. */
  preferenceOpen: boolean;
  /** Collapsed for the current split view only; never persisted. */
  autoCollapsed: boolean;
  splitViewActive: boolean;
}

export function createProductSidebarState(
  preferenceOpen: boolean,
  splitViewActive: boolean,
): ProductSidebarState {
  return {
    preferenceOpen,
    autoCollapsed: splitViewActive && preferenceOpen,
    splitViewActive,
  };
}

export function syncProductSidebarSplitView(
  state: ProductSidebarState,
  splitViewActive: boolean,
): ProductSidebarState {
  if (state.splitViewActive === splitViewActive) {
    return state;
  }
  return createProductSidebarState(state.preferenceOpen, splitViewActive);
}

export function setProductSidebarOpen(
  state: ProductSidebarState,
  open: boolean,
): ProductSidebarState {
  if (state.preferenceOpen === open && !state.autoCollapsed) {
    return state;
  }
  return { ...state, preferenceOpen: open, autoCollapsed: false };
}

export function isProductSidebarOpen(state: ProductSidebarState): boolean {
  return state.preferenceOpen && !state.autoCollapsed;
}
