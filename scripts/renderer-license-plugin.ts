import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';
import {
  rendererDigest, rendererOutputFiles, renderRendererNotices,
  RENDERER_NOTICE_TEXT, RENDERER_NOTICE_MANIFEST, type RendererLicensePackage,
} from '../desktop/host/rendererLicenses.js';

const isNotice = (name: string) => /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(name);

async function packageForModule(id: string): Promise<{ directory: string; metadata: Record<string, unknown> } | null> {
  // Rollup CommonJS proxies start with NUL and Vite ids can have a query suffix.
  // These emitted helpers belong to the installed Vite distribution. Its full
  // LICENSE.md also carries the vendored Rollup CommonJS helper attribution.
  const file = /^\0(?:vite\/(?:preload-helper|modulepreload-polyfill)\.js|commonjsHelpers\.js|commonjs-dynamic-modules)$/.test(id)
    ? createRequire(import.meta.url).resolve('vite/package.json')
    : id.replace(/^\0+/, '').split('?')[0]!;
  if (!file.replaceAll('\\', '/').split('/').includes('node_modules')) return null;
  let directory = dirname(file);
  while (directory !== dirname(directory) && basename(directory) !== 'node_modules') {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as Record<string, unknown>;
      if (typeof metadata.name === 'string' && typeof metadata.version === 'string') return { directory, metadata };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    directory = dirname(directory);
  }
  throw new Error(`Cannot identify renderer dependency: ${id}`);
}

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
        const roots = new Map<string, Record<string, unknown>>();
        for (const id of included) {
          const pkg = await packageForModule(id);
          if (pkg) roots.set(pkg.directory, pkg.metadata);
        }
        const packages: RendererLicensePackage[] = [];
        for (const [directory, metadata] of roots) {
          const files = (await readdir(directory, { withFileTypes: true }))
            .filter(entry => entry.isFile() && isNotice(entry.name)).map(entry => entry.name).sort();
          if (!files.some(file => /^(?:licen[cs]e|copying)(?:[.-].*)?$/i.test(file))) {
            throw new Error(`Renderer dependency ${metadata.name}@${metadata.version} has no license text`);
          }
          const notices: RendererLicensePackage['notices'] = [];
          for (const file of files) {
            const bytes = await readFile(join(directory, file));
            const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            if (!text.trim()) throw new Error(`Empty renderer license: ${metadata.name}/${file}`);
            notices.push({ file, sha256: rendererDigest(bytes), text });
          }
          packages.push({ name: metadata.name as string, version: metadata.version as string,
            license: metadata.license ?? null, notices });
        }
        packages.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'));
        // Hoisted duplicates with identical identity/text need only one notice.
        const unique = packages.filter((pkg, index) => {
          const previous = packages[index - 1];
          if (!previous || previous.name !== pkg.name || previous.version !== pkg.version) return true;
          if (JSON.stringify(previous) !== JSON.stringify(pkg)) throw new Error(`Conflicting renderer licenses: ${pkg.name}@${pkg.version}`);
          return false;
        });
        if (!unique.length) throw new Error('Renderer build has no attributable dependency inputs');
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
