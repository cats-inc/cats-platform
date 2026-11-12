/** Reproduce an actual older schema, rather than only changing its version label. */
export function downgradeDatabaseSchema(raw, version) {
  if (![1, 2, 3, 4, 5].includes(version)) throw Error('Unsupported isolated old-schema fixture');
  raw.exec('drop table conversation_operations');
  if (version === 5) {
    raw.prepare("update meta set value = ? where key = 'schema_version'").run(String(version)); return;
  }
  raw.exec(`drop index conversation_archives_state; drop trigger archive_hot_insert; drop trigger archive_hot_update; drop trigger archive_hot_delete;
    drop trigger archive_header_update; drop table conversation_archive_stage;
    alter table conversation_archive_jobs drop column prepared_digest`);
  if (version === 4) {
    raw.prepare("update meta set value = ? where key = 'schema_version'").run(String(version)); return;
  }
  raw.exec('drop table conversation_archive_jobs; drop table conversation_archives; alter table channels drop column content_revision');
  if (version < 3) raw.exec('drop index messages_presentation; drop index messages_rejection; drop index messages_presentation_time');
  if (version === 1) raw.exec('drop table channel_catalog');
  raw.prepare("update meta set value = ? where key = 'schema_version'").run(String(version));
}
