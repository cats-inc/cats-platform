import { collectRendererLicenses } from './shared/renderer-license-collector.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import {
  rendererDigest, rendererOutputFiles, renderRendererNotices,
  RENDERER_NOTICE_TEXT, RENDERER_NOTICE_MANIFEST,
} from '../desktop/host/rendererLicenses.js';

export function rendererLicensePlugin(): Plugin {
  let outDir: string;
  let included: string[] = [];
  return {
    name: 'cats-renderer-licenses',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const ids = new Set(Object.values(bundle).flatMap(output => output.type === 'chunk' ? Object.keys(output.modules) : []));
        // Vite can remove a CSS-only chunk after extracting its stylesheet.
        for (const id of this.getModuleIds()) {
          if (/\.css(?:\?|$)/.test(id) && this.getModuleInfo(id)?.isIncluded) ids.add(id);
        }
        // PostCSS @import dependencies are build inputs registered as watch
        // files, not Rollup modules. Include dependency styles consumed there.
        for (const id of this.getWatchFiles()) {
          if (/\.(?:css|scss|sass|less|styl|stylus)(?:\?|$)/.test(id)) ids.add(id);
        }
        included = [...ids];
      },
    },
    writeBundle: {
      order: 'post', sequential: true,
      async handler() {
        const unique = await collectRendererLicenses(included);
        const text = renderRendererNotices(unique);
        const outputs = [];
        for (const file of await rendererOutputFiles(outDir)) {
          outputs.push({ file, sha256: rendererDigest(await readFile(join(outDir, file))) });
        }
        await writeFile(join(outDir, RENDERER_NOTICE_TEXT), text);
        await writeFile(join(outDir, RENDERER_NOTICE_MANIFEST), `${JSON.stringify({ schemaVersion: 1,
          noticesSha256: rendererDigest(Buffer.from(text)), packages: unique, outputs }, null, 2)}\n`);
      },
    },
  };
}
