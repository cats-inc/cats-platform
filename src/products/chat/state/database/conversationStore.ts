import type { ChatChannelState, ChatMessage, ChatState } from '../../api/contracts.js';
import type { StateDatabase, StateRow } from '../../../../platform/persistence/state-db/stateDatabase.js';
import type { ChannelProjectionMetadata } from '../core-projection/scoped.js';
import { MessageCursorExpiredError, type MessagePage, type MessageSearchHit } from '../../shared/transcript.js';
export { MessageCursorExpiredError, type MessagePage, type MessageSearchHit } from '../../shared/transcript.js';
import { decodeMessageCursor, encodeMessageCursor } from '../messageCursor.js';
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
    const stored = this.database.get('select position, message_count, order_revision, json from channels where id = ?', channel.id);
    const previous = this.database.all('select id, message_id, position, json from messages where channel_id = ?', channel.id);
    const byId = new Map(previous.map(row => [String(row.message_id), row]));
    const nextPositions = new Map(messages.map((message, index) => [message.id, index]));
    const incoming = new Set(nextPositions.keys());
    if (incoming.size !== messages.length) throw new Error('Duplicate message identity');
    const changedOrder = previous.some(row => nextPositions.get(String(row.message_id)) !== row.position)
      || messages.some((message, index) => !byId.has(message.id) && index < previous.length);
    const order = Number(stored?.order_revision ?? 0) + (changedOrder ? 1 : 0);
    if (stored?.json !== json || stored.position !== position || stored.message_count !== messages.length || changedOrder) {
      this.database.run('insert into channels(id, position, message_count, order_revision, json) values (?, ?, ?, ?, ?) on conflict(id) do update set position = excluded.position, message_count = excluded.message_count, order_revision = excluded.order_revision, json = excluded.json',
        channel.id, position, messages.length, order, json);
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
    messages.forEach((message, index) => this.putMessage(channel.id, message, index, byId.get(message.id)));
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
      this.database.run('insert into channels(id, position, message_count, order_revision, json) values (?, ?, ?, 0, ?)', channel.id, index, channel.messages.length, JSON.stringify(metadata));
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
      this.database.run('delete from channel_catalog where channel_id = ?', id);
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
    previous?: Record<string, unknown>): void {
    if (message.channelId !== channelId) throw new Error('Message belongs to another conversation');
    const json = JSON.stringify(message);
    if (previous?.json === json && previous.position === position) return;
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
