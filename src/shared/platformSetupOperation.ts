// Setup completion and reset update both auth and chat/core state. Keep them
// serialized so neither can observe or overwrite the other's partial reset.
let setupCriticalSection: Promise<void> = Promise.resolve();

export function runExclusiveSetupOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = setupCriticalSection.then(operation, operation);
  setupCriticalSection = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
