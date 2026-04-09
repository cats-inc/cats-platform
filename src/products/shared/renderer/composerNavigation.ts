import type { NavigateFunction } from 'react-router-dom';

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

export interface ManagedComposerLocationRefLike {
  current: string | null;
}

export function captureManagedComposerLocation(
  managedLocationRef: ManagedComposerLocationRefLike,
): void {
  managedLocationRef.current = readCurrentComposerLocation();
}

export function clearManagedComposerLocation(
  managedLocationRef: ManagedComposerLocationRefLike,
): void {
  managedLocationRef.current = null;
}

export function navigateWithinManagedComposerFlow(
  managedLocationRef: ManagedComposerLocationRefLike,
  navigate: NavigateFunction,
  nextPath: string,
): boolean {
  const currentLocation = readCurrentComposerLocation();
  if (!shouldAutoNavigateComposerLocation(managedLocationRef.current, currentLocation)) {
    return false;
  }

  navigate(nextPath, { replace: true });
  managedLocationRef.current = nextPath;
  return true;
}
