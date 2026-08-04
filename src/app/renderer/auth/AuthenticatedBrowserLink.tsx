import type {
  AnchorHTMLAttributes,
  MouseEvent,
} from 'react';

import type { PlatformBrowserHandoffLaunchPayload } from '../../../shared/browserHandoff.js';
import { resolveDesktopHostBridge } from '../../../shared/desktopRecoveryBridge.js';

interface AuthenticatedBrowserLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  onOpenError?: (error: unknown) => void;
}

export function AuthenticatedBrowserLink({
  href,
  onClick,
  onOpenError,
  ...props
}: AuthenticatedBrowserLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    const bridge = resolveDesktopHostBridge();
    if (!bridge?.openBrowserHandoff) {
      return;
    }

    event.preventDefault();
    void openAuthenticatedDesktopBrowserPath(href).catch((error: unknown) => {
      if (onOpenError) {
        onOpenError(error);
        return;
      }
      globalThis.console?.error('Failed to open authenticated browser path.', error);
    });
  };

  return (
    <a
      {...props}
      href={href}
      onClick={handleClick}
    />
  );
}

export async function openAuthenticatedDesktopBrowserPath(returnTo: string): Promise<void> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.openBrowserHandoff) {
    throw new Error('Desktop browser handoff is unavailable.');
  }
  const response = await fetch('/api/auth/browser-handoff', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ returnTo }),
  });
  if (!response.ok) {
    throw new Error(`Browser handoff request failed with HTTP ${response.status}.`);
  }
  const payload = await response.json() as Partial<PlatformBrowserHandoffLaunchPayload>;
  if (typeof payload.launchPath !== 'string' || !payload.launchPath.trim()) {
    throw new Error('Browser handoff response is invalid.');
  }
  const validHandoff = payload.launchMode === 'handoff'
    && typeof payload.expiresAt === 'string'
    && Boolean(payload.expiresAt.trim());
  const validDirectLaunch = payload.launchMode === 'direct'
    && payload.expiresAt === null;
  if (!validHandoff && !validDirectLaunch) {
    throw new Error('Browser handoff response is invalid.');
  }
  await bridge.openBrowserHandoff(payload.launchPath);
}
