import type {
  DesktopScreenshotOverlaySelectionResult,
} from './screenshotOverlayIpc.js';
import type {
  DesktopScreenshotOverlaySnapshotPayload,
} from './screenshotOverlayPayload.js';
import {
  buildScreenshotOverlaySnapshotPayload,
} from './screenshotOverlayPayload.js';
import type {
  DesktopScreenshotCropDependencies,
  DesktopScreenshotCroppedRegion,
  DesktopScreenshotDisplaySnapshot,
} from './screenshotNativeCapture.js';
import {
  cropDesktopDisplaySnapshotSelection,
  doesDesktopScreenshotSelectionOverlapCaptureCursor,
} from './screenshotNativeCapture.js';

export type DesktopScreenshotOverlaySessionResult =
  | {
      outcome: 'selected';
      region: DesktopScreenshotCroppedRegion;
    }
  | {
      outcome: 'cancelled';
      reason: string;
    };

export class DesktopScreenshotOverlaySession {
  private readonly snapshotsByDisplayId = new Map<number, DesktopScreenshotDisplaySnapshot>();
  private readonly resultPromise: Promise<DesktopScreenshotOverlaySessionResult>;
  private settled = false;
  private resolveResult!: (result: DesktopScreenshotOverlaySessionResult) => void;

  constructor(
    snapshots: DesktopScreenshotDisplaySnapshot[],
    private readonly cropDependencies: DesktopScreenshotCropDependencies,
  ) {
    for (const snapshot of snapshots) {
      this.snapshotsByDisplayId.set(snapshot.displayId, snapshot);
    }
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  getSnapshot(displayId: number): DesktopScreenshotOverlaySnapshotPayload {
    const snapshot = this.snapshotsByDisplayId.get(displayId);
    if (!snapshot) {
      throw new Error(`Unknown screenshot overlay display: ${displayId}`);
    }
    return buildScreenshotOverlaySnapshotPayload(snapshot);
  }

  completeSelection(result: DesktopScreenshotOverlaySelectionResult): void {
    const snapshot = this.snapshotsByDisplayId.get(result.displayId);
    if (!snapshot) {
      this.cancel(`unknown_display:${result.displayId}`);
      return;
    }
    if (doesDesktopScreenshotSelectionOverlapCaptureCursor(snapshot, result.cssRect)) {
      this.cancel('cursor_overlap');
      return;
    }

    const region = cropDesktopDisplaySnapshotSelection(
      snapshot,
      result.cssRect,
      this.cropDependencies,
    );
    if (!region) {
      this.cancel('too_small');
      return;
    }

    this.settle({
      outcome: 'selected',
      region,
    });
  }

  cancel(reason: string): void {
    this.settle({
      outcome: 'cancelled',
      reason,
    });
  }

  waitForResult(): Promise<DesktopScreenshotOverlaySessionResult> {
    return this.resultPromise;
  }

  private settle(result: DesktopScreenshotOverlaySessionResult): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveResult(result);
  }
}
