import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export function hasDesktopAppAuthority(request: IncomingMessage, key: string | undefined): boolean {
  if (!key || !/^[a-f0-9]{64}$/.test(key)) return false;
  const supplied = request.headers['x-cats-desktop-apps'];
  const address = request.socket.remoteAddress;
  return !request.headers.origin && (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1')
    && typeof supplied === 'string' && /^[a-f0-9]{64}$/.test(supplied)
    && timingSafeEqual(Buffer.from(supplied), Buffer.from(key));
}
