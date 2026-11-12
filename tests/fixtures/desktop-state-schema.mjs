/** Reproduce an actual older schema, rather than only changing its version label. */
export function downgradeDatabaseSchema(raw, version) {
  if (![1, 2, 3].includes(version)) throw Error('Unsupported isolated old-schema fixture');
  raw.exec('drop table conversation_archive_jobs; drop table conversation_archives; alter table channels drop column content_revision');
  if (version < 3) raw.exec('drop index messages_presentation; drop index messages_rejection; drop index messages_presentation_time');
  if (version === 1) raw.exec('drop table channel_catalog');
  raw.prepare("update meta set value = ? where key = 'schema_version'").run(String(version));
}
