export const CATS_VITE_PROXY_PATHS = ['/api', '/health', '/runtime'] as const;

export interface CatsViteProxyOptions {
  target: string;
  changeOrigin: false;
  cookieDomainRewrite: '';
  cookiePathRewrite: '/';
}

export function createCatsViteProxyOptions(target: string): CatsViteProxyOptions {
  return {
    target,
    changeOrigin: false,
    cookieDomainRewrite: '',
    cookiePathRewrite: '/',
  };
}
