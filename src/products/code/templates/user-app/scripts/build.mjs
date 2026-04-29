import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = new URL('src/renderer/', root);
const target = new URL('dist/renderer/', root);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
