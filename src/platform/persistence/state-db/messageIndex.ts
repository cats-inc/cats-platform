/** Exact expressions shared by SQLite indexes and their query predicates. */
const metadata = (key: string) => `case when json_valid(json) then json_extract(json, '$.metadata.${key}') end`;
export const MESSAGE_TURN = metadata('turnId');
export const MESSAGE_TARGET_STATE = metadata('targetStateId');
export const MESSAGE_TARGET = metadata('targetId');
export const MESSAGE_EVENT = metadata('event');
export const MESSAGE_TERMINAL = "case when json_valid(json) then case when json_type(json, '$.metadata.terminal') = 'false' then 0 else 1 end end";
export const MESSAGE_PRESENTATION_INDEXES = `
create index messages_presentation on messages(channel_id, (${MESSAGE_TURN}), (${MESSAGE_TARGET_STATE}), (${MESSAGE_EVENT}), (${MESSAGE_TERMINAL}), position);
create index messages_rejection on messages(channel_id, (${MESSAGE_TURN}), (${MESSAGE_TARGET}), (${MESSAGE_EVENT}), position);
create index messages_presentation_time on messages(channel_id, created_at, position);
`;
