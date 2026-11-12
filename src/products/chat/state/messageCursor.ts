export interface MessagePositionCursor { v: 1; channel: string; order: number; before: number; }

export function decodeMessageCursor(value: string, channelId: string): MessagePositionCursor {
  try {
    if (value.length > 4096 || !/^[a-zA-Z0-9_-]+$/u.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as MessagePositionCursor;
    if (cursor?.v !== 1 || cursor.channel !== channelId || !Number.isSafeInteger(cursor.order)
      || cursor.order < 0 || !Number.isSafeInteger(cursor.before) || cursor.before < 0) throw new Error();
    return cursor;
  } catch { throw new RangeError('Invalid conversation page cursor'); }
}

export function encodeMessageCursor(channel: string, order: number, before: number): string {
  return Buffer.from(JSON.stringify({ v: 1, channel, order, before } satisfies MessagePositionCursor)).toString('base64url');
}
