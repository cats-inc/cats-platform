import type { StateDatabase } from '../../../../platform/persistence/state-db/stateDatabase.js';
import { JsonArray } from '../../../../platform/persistence/state-db/canonicalJson.js';
import { envelopeCore, parseJsonRecord, type StorageEnvelope } from './profileFormat.js';

/** Caller holds the profile lock (or a database snapshot for a synchronous digest).
 * Each history query reads an indexed window; export never duplicates all transcripts.
 */
export function logicalDatabaseSnapshot(envelope: StorageEnvelope, database: StateDatabase): unknown {
  return {
    ...envelopeCore(envelope),
    chat: {
      ...envelope.chat,
      parallelChatGroups: database.all('select json from parallel_groups order by position')
        .map(row => parseJsonRecord(String(row.json))),
      channels: new JsonArray(function* () {
        for (const row of database.all('select id, json from channels order by position')) {
          const channel = parseJsonRecord(String(row.json));
          yield { ...channel, messages: new JsonArray(function* () {
            let after = -1;
            for (;;) {
              const rows = database.all(`select position, json from messages
                where channel_id = ? and position > ? order by position limit 500`, row.id!, after);
              if (!rows.length) break;
              for (const message of rows) yield parseJsonRecord(String(message.json));
              after = Number(rows.at(-1)!.position);
            }
          }) };
        }
      }),
    },
  };
}
