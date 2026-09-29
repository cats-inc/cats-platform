/**
 * SPEC-124 FR-23. The runtime answers `409 Session is busy` to a second
 * message on a busy session, so a companion heartbeat holds its session here
 * and ordinary dispatch waits instead of failing the owner's turn.
 * Process-local on purpose: both writers live in the platform process.
 */
const heldSessions = new Map<string, Promise<void>>();

export function isSessionTurnGateHeld(sessionId: string): boolean {
  return heldSessions.has(sessionId);
}

export async function waitForSessionTurnGate(sessionId: string): Promise<void> {
  const held = heldSessions.get(sessionId);
  if (held) {
    await held;
  }
}

/** The gate is taken synchronously, so no dispatch can slip in before `operation` starts. */
export function runWithSessionTurnGate<T>(
  sessionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = heldSessions.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = previous.then(() => released);
  heldSessions.set(sessionId, held);
  return (async () => {
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (heldSessions.get(sessionId) === held) {
        heldSessions.delete(sessionId);
      }
    }
  })();
}
