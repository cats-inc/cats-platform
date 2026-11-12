import { isDeepStrictEqual } from 'node:util';
import type { CatsCoreState } from '../../../../core/types.js';
import { createDefaultCoreState } from '../../../../core/model/index.js';
import type { ChatChannelState, ChatState } from '../../api/contracts.js';
import { createChatRootContainer, createTemporaryParticipantActors } from './entities.js';

/** Only fields used by the shared root/actor projections. No unrelated transcripts or
 * workflow bodies are loaded to update one channel's Core projection.
 */
export type ChannelProjectionMetadata = Pick<ChatChannelState,
  'id' | 'title' | 'createdAt' | 'updatedAt' | 'participantAssignments' | 'catAssignments'>;

const COLLECTIONS = Object.entries(createDefaultCoreState()).filter(([, value]) => Array.isArray(value))
  .map(([key]) => key as keyof CatsCoreState);
interface Entity { id: string; }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const own = (value: Record<string, unknown>, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined;

/** Known fields follow the projection delta; passive fields absent from that delta
 * remain owned by their original record, including nested metadata extensions.
 */
function applyDelta(current: unknown, before: unknown, after: unknown): unknown {
  if (isDeepStrictEqual(before, after)) return current;
  if (!record(after) || !record(current)) return structuredClone(after);
  const previous = record(before) ? before : {};
  const next = { ...current };
  for (const key of new Set([...Object.keys(previous), ...Object.keys(after)])) {
    if (isDeepStrictEqual(own(previous, key), own(after, key))) continue;
    if (!Object.hasOwn(after, key)) delete next[key];
    else Object.defineProperty(next, key, { configurable: true, enumerable: true, writable: true,
      value: applyDelta(own(current, key), own(previous, key), own(after, key)) });
  }
  return next;
}

function updateRecord(current: Entity, before: Entity | undefined, after: Entity): Entity {
  const result = applyDelta(current, before, after) as Entity & { updatedAt?: string };
  const updatedAt = (after as Entity & { updatedAt?: string }).updatedAt;
  if (typeof updatedAt === 'string') result.updatedAt = updatedAt;
  return result;
}

/** Compare before/after projections at one instant and apply only their actual deltas.
 * An absent unrelated active turn is not a deletion; unchanged records keep all of their
 * existing extension fields, timestamps and collection positions. Global root/temporary
 * actors use compact metadata from every channel, including shared participant identities.
 */
export function mergeScopedCoreProjection(core: CatsCoreState, before: CatsCoreState,
  after: CatsCoreState, metadata: ChatState, channels: ChannelProjectionMetadata[],
  nextChannel: ChatChannelState): CatsCoreState {
  const nextChannels = channels.map(channel => channel.id === nextChannel.id ? nextChannel : channel);
  before.containers = before.containers.map(container => container.kind === 'chat_root'
    ? createChatRootContainer({ ...metadata, channels }) : container);
  after.containers = after.containers.map(container => container.kind === 'chat_root'
    ? createChatRootContainer({ ...metadata, channels: nextChannels }) : container);
  before.actors = [...before.actors.filter(actor => actor.source !== 'chat_participant'),
    ...createTemporaryParticipantActors({ channels })];
  after.actors = [...after.actors.filter(actor => actor.source !== 'chat_participant'),
    ...createTemporaryParticipantActors({ channels: nextChannels })];
  const next = { ...core, updatedAt: after.updatedAt, setupCompleteAt: after.setupCompleteAt };
  for (const key of COLLECTIONS) {
    const prior = before[key] as Entity[];
    const projected = after[key] as Entity[];
    const oldById = new Map(prior.map(record => [record.id, record]));
    const nextById = new Map(projected.map(record => [record.id, record]));
    const changed = new Set([...oldById.keys(), ...nextById.keys()].filter(id =>
      !isDeepStrictEqual(oldById.get(id), nextById.get(id))));
    const current = core[key] as Entity[];
    const currentIds = new Set(current.map(record => record.id));
    const values = current.flatMap(record => !changed.has(record.id) ? [record]
      : nextById.has(record.id) ? [updateRecord(record, oldById.get(record.id), nextById.get(record.id)!)] : []);
    for (const record of projected) if (changed.has(record.id) && !currentIds.has(record.id)) values.push(record);
    (next as unknown as Record<string, unknown>)[key] = values;
  }
  return next;
}
