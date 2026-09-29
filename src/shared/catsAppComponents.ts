/** Versioned deployment contract. Components share one package, trust grant and data directory. */
export interface CatsAppFrontend {
  id: string;
  entrypoint: string;
}

export interface CatsAppService {
  id: string;
  entrypoint: string;
  dependsOn?: string[];
  routes: { path: string; methods: ('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')[];
    exposure: 'private' | 'external' }[];
}

export interface CatsAppWorker {
  id: string;
  entrypoint: string;
  dependsOn?: string[];
}

export interface CatsAppComponents {
  schemaVersion: 1;
  primaryFrontend: string;
  frontends: CatsAppFrontend[];
  services: CatsAppService[];
  workers: CatsAppWorker[];
  /** Invoked against a staged copy before an update can become active. */
  data: { schemaVersion: number; migration?: string };
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string'
  && /^[a-z][a-z0-9-]{0,47}$/.test(value);
const entry = (value: unknown, suffix: string): value is string => typeof value === 'string'
  && value.length <= 180 && /^[a-zA-Z0-9_./-]+$/.test(value) && value.endsWith(suffix)
  && value.split('/').every(part => part && part !== '.' && part !== '..'
    && !part.endsWith('.') && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every(key => allowed.includes(key));

export function parseAppComponents(value: unknown): CatsAppComponents {
  if (!record(value) || value.schemaVersion !== 1
    || !keys(value, ['schemaVersion', 'primaryFrontend', 'frontends', 'services', 'workers', 'data'])
    || !Array.isArray(value.frontends) || !Array.isArray(value.services) || !Array.isArray(value.workers)
    || value.frontends.length < 1 || value.frontends.length > 8 || value.services.length > 8
    || value.workers.length > 8 || !record(value.data)
    || !keys(value.data, ['schemaVersion', 'migration']) || !Number.isSafeInteger(value.data.schemaVersion)
    || Number(value.data.schemaVersion) < 1
    || (value.data.migration !== undefined && !entry(value.data.migration, '.mjs'))) {
    throw new Error('Invalid App components v1 deployment.');
  }
  const seen = new Set<string>();
  const processes = new Map<string, string[]>();
  const routes: { path: string; exposure: string; methods: string[] }[] = [];
  for (const [kind, rows] of [['frontend', value.frontends], ['service', value.services],
    ['worker', value.workers]] as const) {
    for (const item of rows) {
      if (!record(item) || !id(item.id) || seen.has(item.id)
        || !keys(item, kind === 'frontend' ? ['id', 'entrypoint']
          : kind === 'service' ? ['id', 'entrypoint', 'dependsOn', 'routes'] : ['id', 'entrypoint', 'dependsOn'])
        || !entry(item.entrypoint, kind === 'frontend' ? '.html' : '.mjs')) {
        throw new Error('Invalid, duplicate or unsafe App component.');
      }
      seen.add(item.id);
      if (kind === 'frontend') continue;
      if (item.dependsOn !== undefined && (!Array.isArray(item.dependsOn)
        || item.dependsOn.length > 16 || !item.dependsOn.every(id)
        || new Set(item.dependsOn).size !== item.dependsOn.length)) {
        throw new Error('Invalid App component dependencies.');
      }
      processes.set(item.id, (item.dependsOn ?? []) as string[]);
      if (kind !== 'service') continue;
      if (!Array.isArray(item.routes) || item.routes.length < 1 || item.routes.length > 32) {
        throw new Error('App services require bounded declared routes.');
      }
      for (const route of item.routes) {
        if (!record(route) || !keys(route, ['path', 'methods', 'exposure'])
          || typeof route.path !== 'string' || route.path.length > 160
          || !/^\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/.test(route.path)
          || route.path.startsWith('/_cats') || route.path.startsWith('/ui')
          || !['private', 'external'].includes(String(route.exposure))
          || !Array.isArray(route.methods) || route.methods.length < 1 || route.methods.length > 5
          || !route.methods.every(method => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
          || new Set(route.methods).size !== route.methods.length) {
          throw new Error('Invalid App service route.');
        }
        const candidate = route as unknown as typeof routes[number];
        if (routes.some(other => (other.path === candidate.path || other.path.startsWith(`${candidate.path}/`)
          || candidate.path.startsWith(`${other.path}/`)) && other.methods.some(method => candidate.methods.includes(method)))) {
          throw new Error('Overlapping App service routes.');
        }
        routes.push(candidate);
      }
    }
  }
  if (!value.frontends.some(item => item.id === value.primaryFrontend)) {
    throw new Error('The primary App frontend must exist.');
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (name: string) => {
    if (active.has(name) || !processes.has(name)) throw new Error('Invalid or cyclic App dependency.');
    if (visited.has(name)) return;
    active.add(name);
    for (const dependency of processes.get(name)!) visit(dependency);
    active.delete(name); visited.add(name);
  };
  for (const name of processes.keys()) visit(name);
  return structuredClone(value) as unknown as CatsAppComponents;
}
