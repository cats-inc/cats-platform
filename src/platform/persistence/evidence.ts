import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { EvidenceEvent } from '../../core/types.js';

function resolveEvidencePath(dataDir: string, conversationId: string): string {
  return path.join(dataDir, 'evidence', `${conversationId}.jsonl`);
}

export function appendEvidenceEvent(
  dataDir: string,
  conversationId: string,
  event: EvidenceEvent,
): void {
  const filePath = resolveEvidencePath(dataDir, conversationId);
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf-8');
}

export function readEvidenceEvents(
  dataDir: string,
  conversationId: string,
): EvidenceEvent[] {
  const filePath = resolveEvidencePath(dataDir, conversationId);
  let raw: string;

  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const events: EvidenceEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      events.push(JSON.parse(trimmed) as EvidenceEvent);
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}
