import type { Href } from 'expo-router';

import type { MobileProductMode } from '../../src/mobile/index.js';

/**
 * Mobile-route path builders. Centralises the `/(tabs)/...` URL
 * shape so a future restructuring of the expo-router tree only
 * needs to change one file. Earlier the mobile codebase had inline
 * template literals at every navigation call site, which made
 * route renames touch every screen.
 *
 * These are mobile-specific (web has its own URL conventions
 * without the `/(tabs)/` prefix). For chat-product domain logic
 * shared between web and mobile, see
 * `src/products/chat/shared/`.
 *
 * Return type is `Href` (expo-router's typed-routes alias) so call
 * sites stay typed against the generated route tree at
 * `.expo/types/router.d.ts`. Each builder casts because the
 * generated type is a literal-string union; building the same
 * literal at runtime would require complex template-literal
 * inference.
 */
export const mobileRoutes = {
  catsDirectory: (): Href => '/(tabs)/cats' as Href,
  catDetail: (catId: string): Href =>
    `/(tabs)/cats/${encodeURIComponent(catId)}` as Href,
  productSidebar: (product: MobileProductMode): Href =>
    `/(tabs)/${product}` as Href,
  productChannel: (product: MobileProductMode, channelId: string): Href =>
    `/(tabs)/${product}/${channelId}` as Href,
  productNewDraft: (
    product: MobileProductMode,
    options: {
      entryKind: string;
      directLane?: { catId: string; catName: string } | null;
    },
  ): Href => {
    const params = new URLSearchParams({ entryKind: options.entryKind });
    if (options.directLane) {
      params.set('catId', options.directLane.catId);
      params.set('catName', options.directLane.catName);
    }
    return `/(tabs)/${product}/new?${params.toString()}` as Href;
  },
  settings: (): Href => '/(tabs)/settings' as Href,
} as const;
