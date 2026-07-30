/**
 * `@types/react-dom@18` ships `server.d.ts` but no `server.browser.d.ts`, even
 * though the runtime subpath exists and the suite imports it in 44 files.
 *
 * Only `renderToStaticMarkup` is declared, because that is all the suite uses.
 * Re-exporting the whole of `react-dom/server` would claim the Node-only
 * streaming renderers exist on the browser build, which they do not.
 */
declare module 'react-dom/server.browser' {
  import type { ReactNode } from 'react';

  export function renderToStaticMarkup(element: ReactNode): string;
}
