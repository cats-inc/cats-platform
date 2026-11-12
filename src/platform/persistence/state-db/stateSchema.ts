/** SPEC-144: conversations and parallel groups; settings and Core remain JSON. */
import { MESSAGE_PRESENTATION_INDEXES } from './messageIndex.js';
export const STATE_SCHEMA_VERSION = 3;
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
export const STATE_SCHEMA_UPGRADES: Record<number, string> = { 1: `${CHANNEL_CATALOG_SQL}
insert into channel_catalog(channel_id, position, title, created_at, updated_at, cat_assignments, participant_assignments)
select id, position, json_extract(json, '$.title'), json_extract(json, '$.createdAt'),
  json_extract(json, '$.updatedAt'), coalesce(json_extract(json, '$.catAssignments'), '[]'),
  coalesce(json_extract(json, '$.participantAssignments'), '[]') from channels;
`, 2: MESSAGE_PRESENTATION_INDEXES };

export const STATE_SCHEMA_SQL = `
create table meta(key text primary key not null, value text not null) strict, without rowid;
create table channels(
  id text primary key not null,
  position integer not null,
  message_count integer not null,
  order_revision integer not null,
  json text not null
) strict;
${CHANNEL_CATALOG_SQL}
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
`;
