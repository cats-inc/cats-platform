import type { PlatformProductDescriptor } from '../../../shared/platform-contract.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';

export interface PlatformSettingsProductPlaceholderProps {
  productId: string;
  products: PlatformProductDescriptor[];
  title: string;
  subtitle: string;
}

export function PlatformSettingsProductPlaceholder({
  productId,
  products,
  title,
  subtitle,
}: PlatformSettingsProductPlaceholderProps) {
  return (
    <PlatformSettingsShell section={productId} title={title} products={products}>
      <div className="contentCard">
        <h2>{title} settings</h2>
        <p className="heroNote">
          {subtitle}
        </p>
      </div>
    </PlatformSettingsShell>
  );
}
