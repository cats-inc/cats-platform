import type { ChatChannelState, ChatMessage, ChatState } from '../../api/contracts.js';
import type { StateDatabase, StateRow } from '../../../../platform/persistence/state-db/stateDatabase.js';
import type { ChannelProjectionMetadata } from '../core-projection/scoped.js';
import { MessageCursorExpiredError, type MessagePage, type MessageSearchHit } from '../../../shared/transcript.js';
export { MessageCursorExpiredError, type MessagePage, type MessageSearchHit } from '../../../shared/transcript.js';
import { decodeMessageCursor, encodeMessageCursor } from '../messageCursor.js';
import { hasUnresolvedCatlasChoice } from '../../shared/catlasConversation.js';
import { presentationTargetKey, type MessagePresentationPlacement } from '../../../shared/transcript.js';
import { MESSAGE_TURN, MESSAGE_TARGET_STATE, MESSAGE_TARGET, MESSAGE_EVENT, MESSAGE_TERMINAL } from '../../../../platform/persistence/state-db/messageIndex.js';
import type { CatsCoreState } from '../../../../core/types.js';
import { buildChatConversationId } from '../../../../shared/chatCoreIds.js';
import { randomUUID } from 'node:crypto';
import { DEFAULT_MESSAGE_PAGE_SIZE } from '../../../shared/transcript.js';
import { canonicalDigest } from '../../../../platform/persistence/state-db/canonicalJson.js';
import { conversationArchive, openConversationArchive } from './archiveAssets.js';
import { ProfileStorageError } from './profileFormat.js';
import {
  buildSearchQuery, conversationTerm, indexText, INDEX_FORM,
} from '../../../../platform/persistence/state-db/searchText.js';

function bounded(value: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer from 1 to ${maximum}`);
  }
  return value;
}

/** Typed product layer; only the Platform adapter reaches SQLite. */
export class ConversationDatabase {
  constructor(readonly database: StateDatabase) {}

  get indexCurrent(): boolean {
    return this.database.snapshot(() => this.database.meta('index_form') === String(INDEX_FORM)
      && this.database.meta('index_unicode') === (process.versions.unicode ?? 'unknown'));
  }

  /** Complete materialization for global legacy-shaped product operations, not a paged read. */
  channels(): ChatChannelState[] {
    return this.database.snapshot(() => this.database.all('select id, json from channels order by position').map(row => ({
      ...JSON.parse(String(row.json)) as ChatChannelState,
      messages: this.messages(String(row.id)),
    })));
  }

  channel(id: string): ChatChannelState | null {
    return this.database.snapshot(() => {
      const row = this.database.get('select json from channels where id = ?', id);
      return row ? { ...JSON.parse(String(row.json)) as ChatChannelState, messages: this.messages(id) } : null;
    });
  }

  headers(): Omit<ChatChannelState, 'messages'>[] {
    return this.database.all('select json from channels order by position')
      .map(row => JSON.parse(String(row.json)) as Omit<ChatChannelState, 'messages'>);
  }

  header(id: string): Omit<ChatChannelState, 'messages'> | null {
    const row = this.database.get('select json from channels where id = ?', id);
    return row ? JSON.parse(String(row.json)) as Omit<ChatChannelState, 'messages'> : null;
  }

  putPresentationFacts(channel: ChatChannelState): void {
    this.database.setMeta(`channel_choice:${channel.id}`, hasUnresolvedCatlasChoice(channel) ? '1' : '0');
  }

  presentationFacts(): Map<string, boolean> {
    return new Map(this.database.all('select key, value from meta where key >= ? and key < ?', 'channel_choice:', 'channel_choice;')
      .map(row => [String(row.key).slice('channel_choice:'.length), row.value === '1']));
  }

  /** Only candidate targets in this window reach indexed global-placement probes. */
  presentationPlacements(core: CatsCoreState, channelId: string, page: MessagePage, newest: boolean, force = false): MessagePresentationPlacement[] {
    const ids = new Set(page.messages.map(message => message.id));
    const targets = new Set(page.messages.map(message => presentationTargetKey(message.metadata?.turnId, message.metadata?.targetStateId)));
    const times = page.messages.map(message => message.createdAt).sort();
    const nextTime = !newest && times.length ? this.database.get(
      'select created_at from messages where channel_id = ? and created_at > ? order by created_at, position limit 1',
      channelId, times.at(-1)!) : null;
    const snapshots = new Map<string, CatsCoreState['segments'][number]>();
    for (const segment of core.segments) {
      if (segment.conversationId !== buildChatConversationId(channelId) || segment.metadata?.event !== 'conversation_presentation'
        || segment.metadata.channelId !== channelId) continue;
      const key = presentationTargetKey(segment.turnId, segment.metadata.targetStateId);
      const previous = snapshots.get(key);
      if (!previous || previous.createdAt <= segment.createdAt) snapshots.set(key, segment);
    }
    const proofs: MessagePresentationPlacement[] = [];
    for (const [key, segment] of snapshots) {
      const value = segment.metadata.presentation as { phase?: unknown } | null;
      const lane = core.lanes.find(candidate => candidate.id === segment.laneId);
      const live = value?.phase === 'streaming' && (!lane || !['failed', 'cancelled', 'completed'].includes(lane.status));
      const withinTime = times.length > 0 && (segment.createdAt >= times[0]! || page.nextCursor === null)
        && (newest || !nextTime || segment.createdAt < String(nextTime.created_at));
      if (!force && !targets.has(key) && !ids.has(String(segment.metadata.sourceMessageId)) && !withinTime
        && !(live && newest) && !(newest && page.total === 0)) continue;
      const turn = segment.turnId;
      const target = typeof segment.metadata.targetStateId === 'string' ? segment.metadata.targetStateId : null;
      const readResponse = (terminal: number) => this.database.get(`select message_id from messages where channel_id = ?
        and (${MESSAGE_TURN}) is ? and (${MESSAGE_TARGET_STATE}) is ? and (${MESSAGE_EVENT}) = ?
        and (${MESSAGE_TERMINAL}) = ? order by position desc limit 1`, channelId, turn, target, 'assistant_turn_segment', terminal);
      const response = readResponse(1) ?? readResponse(0);
      const rejected = this.database.get(`select id from messages where channel_id = ? and (${MESSAGE_TURN}) is ?
        and (${MESSAGE_TARGET}) is ? and (${MESSAGE_EVENT}) = ? limit 1`, channelId, turn,
      typeof segment.metadata.targetId === 'string' ? segment.metadata.targetId : null, 'assistant_finalization_rejected');
      const anchor = response ? null : live
        ? this.database.get('select message_id from messages where channel_id = ? order by position desc limit 1', channelId)
        : this.database.get('select message_id from messages where channel_id = ? and created_at <= ? order by created_at desc, position desc limit 1', channelId, segment.createdAt)
          ?? this.database.get('select message_id from messages where channel_id = ? order by position limit 1', channelId);
      proofs.push({ key, responseMessageId: response ? String(response.message_id) : null,
        anchorMessageId: anchor ? String(anchor.message_id) : null, rejected: Boolean(rejected), newestEmpty: newest && page.total === 0 });
    }
    return proofs;
  }

  messagePosition(channelId: string, messageId: string): number | null {
    const row = this.database.get('select position from messages where channel_id = ? and message_id = ?', channelId, messageId);
    return row ? Number(row.position) : null;
  }

  projectionMetadata(): ChannelProjectionMetadata[] {
    return this.database.all(`select channel_id, title, created_at, updated_at,
      cat_assignments, participant_assignments from channel_catalog order by position`)
      .map(row => ({ id: String(row.channel_id), title: String(row.title), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
        catAssignments: JSON.parse(String(row.cat_assignments)),
        participantAssignments: JSON.parse(String(row.participant_assignments)) }));
  }

  position(id: string): number | null {
    const row = this.database.get('select position from channels where id = ?', id);
    return row ? Number(row.position) : null;
  }

  groups(): ChatState['parallelChatGroups'] {
    return this.database.all('select json from parallel_groups order by position')
      .map(row => JSON.parse(String(row.json)) as ChatState['parallelChatGroups'][number]);
  }

  messages(channelId: string): ChatMessage[] {
    const archive = conversationArchive(this.database, channelId);
    if (archive) {
      const reader = openConversationArchive(this.database, archive);
      try {
        const messages = [...reader.messages()];
        if (canonicalDigest(messages) !== archive.messagesDigest) throw new ProfileStorageError('archive_invalid', 'A conversation archive did not verify.');
        return messages;
      } finally { reader.close(); }
    }
    return this.database.all('select json from messages where channel_id = ? order by position', channelId)
      .map(row => JSON.parse(String(row.json)) as ChatMessage);
  }

  page(channelId: string, limit = 50, before?: string): MessagePage {
    bounded(limit, 200, 'limit');
    const cursor = before === undefined ? null : decodeMessageCursor(before, channelId);
    return this.database.snapshot(() => {
      const channel = this.database.get('select message_count, order_revision from channels where id = ?', channelId);
      if (!channel) throw new Error(`Channel not found: ${channelId}`);
      const order = Number(channel.order_revision);
      if (cursor && cursor.order !== order) throw new MessageCursorExpiredError();
      const rows = cursor === null
        ? this.database.all('select position, json from messages where channel_id = ? order by position desc limit ?', channelId, limit + 1)
        : this.database.all('select position, json from messages where channel_id = ? and position < ? order by position desc limit ?', channelId, cursor.before, limit + 1);
      const hasMore = rows.length > limit;
      const selected = rows.slice(0, limit).reverse();
      return {
        messages: selected.map(row => JSON.parse(String(row.json)) as ChatMessage),
        total: Number(channel.message_count),
        orderRevision: String(order),
        historyRevision: this.database.meta(`channel_history:${channelId}`) ?? '0',
        nextCursor: hasMore ? encodeMessageCursor(channelId, order, Number(selected[0]!.position)) : null,
      };
    });
  }

  search(input: string, options: { channelId?: string; limit?: number } = {}): MessageSearchHit[] {
    const limit = bounded(options.limit ?? 50, 100, 'limit');
    const query = buildSearchQuery(input);
    if (!query) return [];
    const match = options.channelId === undefined ? query
      : `"${conversationTerm(options.channelId)}" AND (${query})`;
    return this.database.snapshot(() => {
      if (!this.indexCurrent) throw new Error('The conversation search index needs rebuilding');
      // Adapted from Bot's SEARCH_CANDIDATES_SQL: visit newest postings first and rank
      // only these 1,000. Ranking every match regresses to seconds on common terms.
      const candidates = this.database.all(
        'select rowid, rank from message_search where message_search match ? order by rowid desc limit ?',
        match, 1000,
      ).sort((a, b) => Number(a.rank) - Number(b.rank) || Number(b.rowid) - Number(a.rowid));
      const hits: MessageSearchHit[] = [];
      for (const candidate of candidates) {
        const row = this.database.get('select channel_id, json from messages where id = ?', candidate.rowid!);
        if (!row || options.channelId !== undefined && row.channel_id !== options.channelId) continue;
        hits.push({ channelId: String(row.channel_id), message: JSON.parse(String(row.json)) as ChatMessage });
        if (hits.length === limit) break;
      }
      return hits;
    });
  }

  /** Joins a coordinated outer transaction, or opens its own for a standalone mutation. */
  putChannel(channel: ChatChannelState, position: number): void {
    this.database.transaction(() => this.putChannelUnsafe(channel, position));
  }

  private putChannelUnsafe(channel: ChatChannelState, position: number): void {
    this.assertIndexWritable();
    if (!Number.isSafeInteger(position) || position < 0) throw new RangeError('Invalid conversation position');
    const { messages, ...metadata } = channel;
    const json = JSON.stringify(metadata);
    const archive = conversationArchive(this.database, channel.id);
    if (archive) {
      if (channel.status !== 'archived' || canonicalDigest(messages) !== archive.messagesDigest) {
        throw new ProfileStorageError('conversation_archived', 'Restore this archived conversation before changing its transcript.');
      }
      const stored = this.database.get('select position, json from channels where id = ?', channel.id);
      if (!stored) throw new ProfileStorageError('archive_invalid', 'The archived conversation header is missing.');
      if (stored.json !== json) this.database.run('update channels set json = ?, position = ?, content_revision = ? where id = ?', json, position, randomUUID(), channel.id);
      else if (stored.position !== position) this.database.run('update channels set position = ? where id = ?', position, channel.id);
      this.putCatalog(channel, position);
      return;
    }
    const stored = this.database.get('select position, message_count, order_revision, json from channels where id = ?', channel.id);
    const previous = this.database.all('select id, message_id, position, json from messages where channel_id = ?', channel.id);
    const byId = new Map(previous.map(row => [String(row.message_id), row]));
    const nextPositions = new Map(messages.map((message, index) => [message.id, index]));
    const incoming = new Set(nextPositions.keys());
    if (incoming.size !== messages.length) throw new Error('Duplicate message identity');
    const changedOrder = previous.some(row => nextPositions.get(String(row.message_id)) !== row.position)
      || messages.some((message, index) => !byId.has(message.id) && index < previous.length);
    const order = Number(stored?.order_revision ?? 0) + (changedOrder ? 1 : 0);
    let changedContent = stored?.json !== json || stored.message_count !== messages.length || changedOrder;
    if (stored?.json !== json || stored.position !== position || stored.message_count !== messages.length || changedOrder) {
      this.database.run('insert into channels(id, position, message_count, order_revision, content_revision, json) values (?, ?, ?, ?, ?, ?) on conflict(id) do update set position = excluded.position, message_count = excluded.message_count, order_revision = excluded.order_revision, json = excluded.json',
        channel.id, position, messages.length, order, randomUUID(), json);
    }
    this.putCatalog(channel, position);
    // Stage moves outside the committed position range, preserving row/index identities.
    for (const row of previous) {
      const nextPosition = nextPositions.get(String(row.message_id));
      if (nextPosition === undefined) {
        this.database.run('delete from message_search where rowid = ?', row.id!);
        this.database.run('delete from messages where id = ?', row.id!);
        byId.delete(String(row.message_id));
      } else if (nextPosition !== row.position) {
        this.database.run('update messages set position = ? where id = ?', -Number(row.position) - 1, row.id!);
      }
    }
    let changedOlder = false;
    const previousLatestTime = this.database.get('select created_at, position from messages where channel_id = ? order by created_at desc, position desc limit 1', channel.id);
    messages.forEach((message, index) => {
      const previous = byId.get(message.id);
      const changed = this.putMessage(channel.id, message, index, previous);
      changedContent ||= changed;
      if (changed && index < messages.length - DEFAULT_MESSAGE_PAGE_SIZE) changedOlder = true;
      if (changed && messages.length > DEFAULT_MESSAGE_PAGE_SIZE) {
        const oldMessage = previous ? JSON.parse(String(previous.json)) as ChatMessage : undefined;
        const placement = (item: ChatMessage | undefined) => {
          const metadata = item?.metadata;
          return ['assistant_turn_segment', 'assistant_finalization_rejected'].includes(String(metadata?.event))
            ? JSON.stringify([metadata?.event, metadata?.turnId, metadata?.targetStateId, metadata?.targetId, metadata?.terminal]) : null;
        };
        if (placement(message) !== placement(oldMessage) || oldMessage && oldMessage.createdAt !== message.createdAt
          // With non-monotonic imported times, a new maximum can move a sealed
          // Core-only response from an old row into the newest window too.
          || !oldMessage && previousLatestTime && (message.createdAt <= String(previousLatestTime.created_at)
            || Number(previousLatestTime.position) < messages.length - DEFAULT_MESSAGE_PAGE_SIZE)) changedOlder = true;
      }
    });
    if (changedOlder) this.database.setMeta(`channel_history:${channel.id}`, randomUUID());
    if (changedContent) this.database.run('update channels set content_revision = ? where id = ?', randomUUID(), channel.id);
  }

  /** Initial import gives search row IDs chronological order, independently of channel order. */
  importChannels(channels: ChatChannelState[]): void {
    this.database.transaction(() => this.importChannelsUnsafe(channels));
  }

  private importChannelsUnsafe(channels: ChatChannelState[]): void {
    if (this.database.get('select id from channels limit 1')
      || this.database.get('select id from messages limit 1')
      || this.database.get('select position from message_import limit 1')) {
      throw new Error('Import requires an empty conversation database');
    }
    channels.forEach((channel, index) => {
      const { messages: _messages, ...metadata } = channel;
      this.database.run('insert into channels(id, position, message_count, order_revision, content_revision, json) values (?, ?, ?, 0, ?, ?)', channel.id, index, channel.messages.length, randomUUID(), JSON.stringify(metadata));
      this.putCatalog(channel, index);
      channel.messages.forEach((message, position) => {
        const milliseconds = Date.parse(message.createdAt);
        this.database.run('insert into message_import(channel_id, position, created_ms, json) values (?, ?, ?, ?)',
          channel.id, position, Number.isFinite(milliseconds) ? milliseconds : 0, JSON.stringify(message));
      });
    });
    let cursor: [number, string, number] | null = null;
    for (;;) {
      const batch: StateRow[] = cursor === null
        ? this.database.all('select channel_id, position, created_ms, json from message_import order by created_ms, channel_id, position limit 500')
        : this.database.all('select channel_id, position, created_ms, json from message_import where (created_ms, channel_id, position) > (?, ?, ?) order by created_ms, channel_id, position limit 500', ...cursor);
      if (!batch.length) break;
      for (const row of batch) {
        this.putMessage(String(row.channel_id), JSON.parse(String(row.json)) as ChatMessage, Number(row.position));
      }
      const last = batch.at(-1)!;
      cursor = [Number(last.created_ms), String(last.channel_id), Number(last.position)];
    }
    this.database.run('delete from message_import');
    this.database.setMeta('index_form', String(INDEX_FORM));
    this.database.setMeta('index_unicode', process.versions.unicode ?? 'unknown');
  }

  private putCatalog(channel: ChatChannelState, position: number): void {
    this.putPresentationFacts(channel);
    this.database.run(`insert into channel_catalog(channel_id, position, title, created_at, updated_at, cat_assignments, participant_assignments)
      values (?, ?, ?, ?, ?, ?, ?) on conflict(channel_id) do update set position = excluded.position,
      title = excluded.title, created_at = excluded.created_at, updated_at = excluded.updated_at,
      cat_assignments = excluded.cat_assignments, participant_assignments = excluded.participant_assignments
      where channel_catalog.position != excluded.position or channel_catalog.title != excluded.title
      or channel_catalog.created_at != excluded.created_at or channel_catalog.updated_at != excluded.updated_at
      or channel_catalog.cat_assignments != excluded.cat_assignments
      or channel_catalog.participant_assignments != excluded.participant_assignments`,
    channel.id, position, channel.title, channel.createdAt, channel.updatedAt,
    JSON.stringify(channel.catAssignments ?? []), JSON.stringify(channel.participantAssignments ?? []));
  }

  synchronize(chat: ChatState): void {
    this.database.transaction(() => this.synchronizeUnsafe(chat));
  }

  private synchronizeUnsafe(chat: ChatState): void {
    this.assertIndexWritable();
    const ids = new Set(chat.channels.map(channel => channel.id));
    if (ids.size !== chat.channels.length) throw new Error('Duplicate conversation identity');
    for (const row of this.database.all('select id from channels')) {
      if (ids.has(String(row.id))) continue;
      this.removeChannel(String(row.id));
    }
    chat.channels.forEach((channel, index) => this.putChannel(channel, index));
    this.putGroups(chat.parallelChatGroups);
    this.database.setMeta('index_form', String(INDEX_FORM));
    this.database.setMeta('index_unicode', process.versions.unicode ?? 'unknown');
  }

  putGroups(groups: ChatState['parallelChatGroups']): void {
    this.database.transaction(() => this.putGroupsUnsafe(groups));
  }

  private putGroupsUnsafe(groups: ChatState['parallelChatGroups']): void {
    const ids = new Set(groups.map(group => group.id));
    if (ids.size !== groups.length) throw new Error('Duplicate parallel group identity');
    for (const row of this.database.all('select id from parallel_groups')) {
      if (!ids.has(String(row.id))) this.database.run('delete from parallel_groups where id = ?', row.id!);
    }
    groups.forEach((group, position) => {
      const json = JSON.stringify(group);
      const stored = this.database.get('select position, json from parallel_groups where id = ?', group.id);
      if (stored?.json !== json || stored.position !== position) {
        this.database.run('insert into parallel_groups(id, position, json) values (?, ?, ?) on conflict(id) do update set position = excluded.position, json = excluded.json',
          group.id, position, json);
      }
    });
  }

  removeChannel(id: string): void {
    this.database.transaction(() => {
      this.assertIndexWritable();
      this.database.run('delete from message_search where rowid in (select id from messages where channel_id = ?)', id);
      this.database.run('delete from messages where channel_id = ?', id);
      this.database.run("update conversation_archives set state = 'delete_pending' where channel_id = ? and state = 'active'", id);
      this.database.run('delete from channel_catalog where channel_id = ?', id);
      this.database.run('delete from meta where key = ?', `channel_choice:${id}`);
      this.database.run('delete from meta where key = ?', `channel_history:${id}`);
      this.database.run('delete from channels where id = ?', id);
    });
  }

  rebuildIndex(): number {
    return this.database.transaction(() => {
      this.database.run('delete from message_search');
      let count = 0; let after = 0;
      for (;;) {
        const batch = this.database.all('select id, channel_id, json from messages where id > ? order by id limit 500', after);
        if (!batch.length) break;
        for (const row of batch) {
          const message = JSON.parse(String(row.json)) as ChatMessage;
          this.indexMessage(Number(row.id), String(row.channel_id), message);
          after = Number(row.id); count++;
        }
      }
      this.database.setMeta('index_form', String(INDEX_FORM));
      this.database.setMeta('index_unicode', process.versions.unicode ?? 'unknown');
      return count;
    }, { durable: true });
  }

  private putMessage(channelId: string, message: ChatMessage, position: number,
    previous?: Record<string, unknown>): boolean {
    if (message.channelId !== channelId) throw new Error('Message belongs to another conversation');
    const json = JSON.stringify(message);
    if (previous?.json === json && previous.position === position) return false;
    let id: number;
    if (previous) {
      id = Number(previous.id);
      this.database.run('update messages set position = ?, created_at = ?, json = ? where id = ?', position, message.createdAt, json, id);
      this.database.run('delete from message_search where rowid = ?', id);
    } else {
      id = this.database.insert('insert into messages(channel_id, message_id, position, created_at, json) values (?, ?, ?, ?, ?)',
        channelId, message.id, position, message.createdAt, json);
    }
    this.indexMessage(id, channelId, message);
    return true;
  }

  private assertIndexWritable(): void {
    if (this.indexCurrent) return;
    if (this.database.get('select id from messages limit 1')) {
      throw new Error('The conversation search index needs rebuilding');
    }
    // Empty/new indexes have no historical terms to mix. Publish identity inside the
    // caller's transaction before the first of several channels is written.
    this.database.setMeta('index_form', String(INDEX_FORM));
    this.database.setMeta('index_unicode', process.versions.unicode ?? 'unknown');
  }

  private indexMessage(id: number, channelId: string, message: ChatMessage): void {
    // Private proposal payloads live behind an owner-only route. Indexing only public body
    // avoids choice/proposal metadata becoming an alternate data-exfiltration channel.
    this.database.run('insert into message_search(rowid, terms) values (?, ?)', id,
      `${indexText(message.body)} ${conversationTerm(channelId)}`);
  }
}
