import { useEffect, useRef } from 'react';

/** A conversation switch uses its retained scroll; only a reset of that same
 * history explicitly returns the current view to its newest messages. */
export function useTranscriptHistoryReset(identity: object, version: number, scrollToBottom: () => void): void {
  const previous = useRef({ identity, version });
  useEffect(() => {
    if (previous.current.identity === identity && previous.current.version !== version) scrollToBottom();
    previous.current = { identity, version };
  }, [identity, version, scrollToBottom]);
}
