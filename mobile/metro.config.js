// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const platformRoot = path.resolve(projectRoot, '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Two pieces are needed for the mobile workspace to consume the
// `cats-platform/src/mobile/` mobile-safe boundary at runtime
// (typecheck already works through TypeScript bundler resolution):
//
//   1. `watchFolders` must include `cats-platform/` so Metro can
//      crawl `cats-platform/src/mobile/` files. By default Metro
//      only follows imports under the project root.
//
//   2. Imports inside the boundary (and inside the mobile workspace
//      that consumes it) ship modern TS ESM `.js`-suffixed paths
//      because the desktop server build runs under NodeNext, which
//      requires explicit extensions. Metro does not collapse a
//      `.js` literal to a `.ts` source by default, so we intercept
//      the resolver and retry without the extension whenever the
//      first lookup fails.
//
// Boundary integrity is still enforced by
// `cats-platform/scripts/check-mobile-boundary.mjs` — that script
// runs separately on every `npm run mobile:typecheck`.

config.watchFolders = [platformRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(platformRoot, 'node_modules'),
];

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const tryDefault = () =>
    defaultResolveRequest
      ? defaultResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);

  const isRelative =
    moduleName.startsWith('./') ||
    moduleName.startsWith('../') ||
    moduleName.startsWith('/');

  if (isRelative && moduleName.endsWith('.js')) {
    try {
      return tryDefault();
    } catch {
      const stripped = moduleName.slice(0, -3);
      return defaultResolveRequest
        ? defaultResolveRequest(context, stripped, platform)
        : context.resolveRequest(context, stripped, platform);
    }
  }

  return tryDefault();
};

module.exports = config;
