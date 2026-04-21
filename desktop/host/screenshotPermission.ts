import type {
  DesktopScreenshotCaptureResult,
} from './contracts.js';

export type DesktopScreenshotMediaAccessStatus =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'unknown';

const MACOS_SCREEN_RECORDING_PERMISSION_MESSAGE =
  'Screen Recording permission is required to capture a screenshot. Grant Cats screen access in macOS System Settings, then restart Cats.';

export function resolveDesktopScreenshotPermissionResult(input: {
  platform: NodeJS.Platform;
  mediaAccessStatus: DesktopScreenshotMediaAccessStatus;
}): DesktopScreenshotCaptureResult | null {
  if (input.platform !== 'darwin') {
    return null;
  }

  if (
    input.mediaAccessStatus === 'granted'
    || input.mediaAccessStatus === 'not-determined'
  ) {
    return null;
  }

  if (
    input.mediaAccessStatus === 'denied'
    || input.mediaAccessStatus === 'restricted'
  ) {
    return {
      outcome: 'permission_denied',
      message: MACOS_SCREEN_RECORDING_PERMISSION_MESSAGE,
    };
  }

  return {
    outcome: 'error',
    message: `Screen Recording permission status is unknown: ${input.mediaAccessStatus}`,
  };
}
