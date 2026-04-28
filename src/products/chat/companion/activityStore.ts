import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CompanionActivityEvent } from './activityProjection.js';

/**
 * Append-only event log feeding the companion profile Activity tab.
 *
 * The store is intentionally independent of `CompanionBoxStore`: the box
 * captures durable workspace state (sources, derived, memory, response
 * profile), while activity is a derived audit trail that the projection
 * caps to last 100 entries / 30 days at read time. Events are appended on
 * successful CRUD; consumers should never block their primary action on a
 * write to this store.
 */

export interface CompanionActivityStore {
  list(catId: string): Promise<CompanionActivityEvent[]>;
  append(event: CompanionActivityEvent): Promise<void>;
}

interface StoredActivitySnapshot {
  events: CompanionActivityEvent[];
}

function emptySnapshot(): StoredActivitySnapshot {
  return { events: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredEvent(value: unknown): value is CompanionActivityEvent {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === 'string'
    && typeof value.catId === 'string'
    && typeof value.group === 'string'
    && typeof value.targetKind === 'string'
    && typeof value.targetId === 'string'
    && typeof value.occurredAt === 'string'
  );
}

function parseSnapshot(raw: string): StoredActivitySnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptySnapshot();
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.events)) {
    return emptySnapshot();
  }
  const events = parsed.events.filter(isStoredEvent);
  return { events };
}

export function createMemoryCompanionActivityStore(): CompanionActivityStore {
  const events: CompanionActivityEvent[] = [];
  return {
    async list(catId: string) {
      return events.filter((event) => event.catId === catId);
    },
    async append(event: CompanionActivityEvent) {
      events.push(event);
    },
  };
}

export function createFileCompanionActivityStore(
  filePath: string,
): CompanionActivityStore {
  let cache: StoredActivitySnapshot | null = null;
  let writeQueue: Promise<void> = Promise.resolve();

  async function readSnapshot(): Promise<StoredActivitySnapshot> {
    if (cache) return cache;
    try {
      const raw = await readFile(filePath, 'utf-8');
      cache = parseSnapshot(raw);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') {
        cache = emptySnapshot();
      } else {
        // Treat unreadable / malformed files as empty so a corrupt log
        // never blocks the renderer; the next append will overwrite.
        cache = emptySnapshot();
      }
    }
    return cache;
  }

  async function writeSnapshot(snapshot: StoredActivitySnapshot): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ events: snapshot.events }, null, 2)}\n`,
      'utf-8',
    );
  }

  return {
    async list(catId: string) {
      const snapshot = await readSnapshot();
      return snapshot.events.filter((event) => event.catId === catId);
    },
    async append(event: CompanionActivityEvent) {
      const snapshot = await readSnapshot();
      snapshot.events.push(event);
      writeQueue = writeQueue.then(() => writeSnapshot(snapshot)).catch(() => {});
      await writeQueue;
    },
  };
}

export function resolveCompanionActivityStorePath(stateDir: string): string {
  return path.join(stateDir, 'companion-activity.json');
}
