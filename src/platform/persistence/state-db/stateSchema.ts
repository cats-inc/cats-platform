/** SPEC-144: conversations and parallel groups; settings and Core remain JSON. */
import { MESSAGE_PRESENTATION_INDEXES } from './messageIndex.js';
export const STATE_SCHEMA_VERSION = 6;
/** "CPLT", deliberately different from the image ledger and Cats Bot. */
export const STATE_APPLICATION_ID = 0x43504c54;
const CHANNEL_CATALOG_SQL = `
create table channel_catalog(
  channel_id text primary key not null,
  position integer not null,
  title text not null,
  created_at text not null,
  updated_at text not null,
  cat_assignments text not null,
  participant_assignments text not null
) strict;
create index channel_catalog_position on channel_catalog(position);
`;
const CONVERSATION_OPERATIONS_SQL = `
create table conversation_operations(
  token text primary key not null,
  channel_id text not null,
  lease_token text not null
) strict, without rowid;
create index conversation_operations_channel on conversation_operations(channel_id);
`;
const COLD_ARCHIVES_SQL = `
create table conversation_archives(
  archive_id text primary key not null,
  channel_id text not null,
  state text not null check(state in ('active', 'delete_pending')),
  manifest_digest text not null,
  messages_digest text not null,
  message_count integer not null check(message_count >= 0),
  created_at text not null,
  original_status text not null,
  source_revision text not null,
  channel_revision text not null
) strict;
create unique index conversation_archives_active on conversation_archives(channel_id) where state = 'active';
create table conversation_archive_jobs(
  channel_id text primary key not null,
  token text not null unique,
  lease_token text not null,
  kind text not null check(kind in ('archive', 'restore')),
  archive_id text not null,
  channel_revision text not null,
  created_at text not null
) strict;
`;
const ARCHIVE_STAGE_SQL = `
create index conversation_archives_state on conversation_archives(state, archive_id);
alter table conversation_archive_jobs add column prepared_digest text not null default '';
create table conversation_archive_stage(
  token text not null,
  channel_id text not null,
  message_id text not null,
  position integer not null,
  created_at text not null,
  json text not null,
  terms text not null,
  primary key(token, position),
  unique(token, message_id)
) strict, without rowid;
-- Invalidate a completed staging proof if anything changes before publication.
create trigger archive_stage_insert after insert on conversation_archive_stage
when exists(select 1 from conversation_archive_jobs where token = new.token and prepared_digest != '')
begin update conversation_archive_jobs set prepared_digest = '' where token = new.token; end;
create trigger archive_stage_update after update on conversation_archive_stage
begin update conversation_archive_jobs set prepared_digest = '' where token in (old.token, new.token) and prepared_digest != ''; end;
create trigger archive_stage_delete after delete on conversation_archive_stage
begin update conversation_archive_jobs set prepared_digest = '' where token = old.token and prepared_digest != ''; end;
-- An archive reservation also notices direct row changes, without rewriting a token
-- for every ordinary streaming update when no archive of that channel is underway.
create trigger archive_hot_insert after insert on messages
when exists(select 1 from conversation_archive_jobs where channel_id = new.channel_id and kind = 'archive')
begin update channels set content_revision = lower(hex(randomblob(16))) where id = new.channel_id; end;
create trigger archive_hot_update after update on messages
when exists(select 1 from conversation_archive_jobs where channel_id in (old.channel_id, new.channel_id) and kind = 'archive')
begin update channels set content_revision = lower(hex(randomblob(16))) where id in (old.channel_id, new.channel_id); end;
create trigger archive_hot_delete after delete on messages
when exists(select 1 from conversation_archive_jobs where channel_id = old.channel_id and kind = 'archive')
begin update channels set content_revision = lower(hex(randomblob(16))) where id = old.channel_id; end;
create trigger archive_header_update after update of json on channels
when old.json != new.json and exists(select 1 from conversation_archive_jobs where channel_id = new.id and kind = 'archive')
begin update channels set content_revision = lower(hex(randomblob(16))) where id = new.id; end;
`;
export const STATE_SCHEMA_UPGRADES: Record<number, string> = { 1: `${CHANNEL_CATALOG_SQL}
insert into channel_catalog(channel_id, position, title, created_at, updated_at, cat_assignments, participant_assignments)
select id, position, json_extract(json, '$.title'), json_extract(json, '$.createdAt'),
  json_extract(json, '$.updatedAt'), coalesce(json_extract(json, '$.catAssignments'), '[]'),
  coalesce(json_extract(json, '$.participantAssignments'), '[]') from channels;
`, 2: MESSAGE_PRESENTATION_INDEXES, 3: `
alter table channels add column content_revision text not null default '';
update channels set content_revision = lower(hex(randomblob(16)));
${COLD_ARCHIVES_SQL}`, 4: ARCHIVE_STAGE_SQL, 5: CONVERSATION_OPERATIONS_SQL };

export const STATE_SCHEMA_SQL = `
create table meta(key text primary key not null, value text not null) strict, without rowid;
create table channels(
  id text primary key not null,
  position integer not null,
  message_count integer not null,
  order_revision integer not null,
  content_revision text not null,
  json text not null
) strict;
${CHANNEL_CATALOG_SQL}
${COLD_ARCHIVES_SQL}
create table messages(
  id integer primary key autoincrement,
  channel_id text not null,
  message_id text not null,
  position integer not null,
  created_at text not null,
  json text not null,
  unique(channel_id, message_id),
  unique(channel_id, position)
) strict;
create virtual table message_search using fts5(terms, content='', contentless_delete=1);
${MESSAGE_PRESENTATION_INDEXES}
-- Import batches are ordered here, rather than duplicated/sorted in JavaScript memory.
create table message_import(
  channel_id text not null,
  position integer not null,
  created_ms integer not null,
  json text not null,
  primary key(created_ms, channel_id, position)
) strict, without rowid;
create table parallel_groups(
  id text primary key not null,
  position integer not null,
  json text not null
) strict;
-- A committed metadata handoff is replayed before any reader sees the database.
-- Only the outstanding handoff is retained here; ordinary metadata lives in JSON.
create table metadata_handoff(
  singleton integer primary key check(singleton = 1),
  revision text not null,
  previous_digest text,
  json text not null
) strict;
${ARCHIVE_STAGE_SQL}
${CONVERSATION_OPERATIONS_SQL}
`;
