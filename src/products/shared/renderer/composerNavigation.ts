export function readCurrentComposerLocation(): string {
  const location = globalThis.location;
  if (!location) {
    return '';
  }

  return `${location.pathname ?? ''}${location.search ?? ''}`;
}

export function shouldAutoNavigateComposerLocation(
  managedLocation: string | null,
  currentLocation: string,
): boolean {
  return managedLocation == null || managedLocation === currentLocation;
}
