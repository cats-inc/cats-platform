import { type ReactNode } from 'react';

import type {
  PlatformProductDescriptor,
  PlatformProductSettingsDescriptor,
} from '../../../shared/platform-contract.js';
import {
  resolvePlatformProductSettingsLabel,
  type PlatformProductCopyTranslator,
} from '../platformProductCopy.js';

type PlatformSettingsSection =
  | 'general'
  | 'cats'
  | 'assistants'
  | 'apps'
  | 'desktop'
  | 'runtime'
  | 'data'
  | string;

interface PlatformSettingsProductEntry extends PlatformProductSettingsDescriptor {
  productId: PlatformProductDescriptor['id'];
}

export interface PlatformSettingsShellProps {
  section: PlatformSettingsSection;
  title: string;
  products: PlatformProductDescriptor[];
  children: ReactNode;
}

/**
 * Builds the per-product settings entries the Settings sidebar (`SettingsAppShellSidebar`)
 * surfaces between the Cats group and Apps. Filters to installed
 * products that actually expose at least one settings descriptor and
 * resolves each entry's display label through the shared product-copy
 * map so the sidebar matches the rest of the platform's product
 * naming.
 */
export function buildPlatformSettingsProductEntries(
  products: readonly PlatformProductDescriptor[],
  t?: PlatformProductCopyTranslator,
) : PlatformSettingsProductEntry[] {
  return products
    .filter((product) => product.installState !== 'available' && (product.settings?.length ?? 0) > 0)
    .flatMap((product) =>
      (product.settings ?? []).map((entry) => ({
        ...entry,
        label: resolvePlatformProductSettingsLabel(product.id, entry, t),
        productId: product.id,
      })),
    );
}

/**
 * Per-section canvas wrapper for `/settings/*`. After Settings was
 * promoted to its own surface (see `SettingsShell` +
 * `SettingsAppShellSidebar`), the section nav and the close button
 * moved up into the app-shell sidebar — this wrapper now does just
 * the canvas-side framing each section page needs: an `<h1>` title
 * row plus a `.settingsBody` content slot. The `section` prop is
 * retained for callers that already pass it; it is no longer used
 * for any sidebar highlight (the sidebar derives its active state
 * from the current pathname).
 */
export function PlatformSettingsShell({
  title,
  children,
}: PlatformSettingsShellProps) {
  return (
    <section className="settingsContent">
      <header className="settingsHeader">
        <h1>{title}</h1>
      </header>
      <div className="settingsBody">
        {children}
      </div>
    </section>
  );
}
