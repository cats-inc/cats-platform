// The feature pack bridge the Desktop renderer sees (SPEC-145 FR-C4). These
// types mirror desktop/host/featurePacks/featurePackManager.ts, and
// tests/desktop-feature-pack-host.test.js checks that the lists agree.

export const FEATURE_PACK_STATUSES = [
  'not_installed',
  'downloading',
  'paused',
  'verifying',
  'installed',
  'update_available',
  'update_required',
  'damaged',
  'unsupported',
] as const;

export type FeaturePackStatus = (typeof FEATURE_PACK_STATUSES)[number];

export type FeaturePackPauseReason = 'owner' | 'network' | 'quit';

export interface FeaturePackLicense {
  name: string;
  component: string;
}

export interface FeaturePackSnapshot {
  id: string;
  status: FeaturePackStatus;
  version: string;
  activeVersion: string | null;
  /** Whether the start-time check passes; this, not `status`, allows dictation. */
  usable: boolean;
  downloadSize: number;
  unpackedSize: number;
  receivedBytes: number | null;
  pauseReason: FeaturePackPauseReason | null;
  unsupported: { reason: 'glibc' | 'prerequisite'; detail: string } | null;
  installedSize: number | null;
  languages: string[];
  licenses: FeaturePackLicense[];
  sourceHost: string;
}

export interface FeaturePackFailure {
  stage: string;
  code: string;
  message: string;
}

export interface FeaturePackChange {
  snapshot: FeaturePackSnapshot;
  failure: FeaturePackFailure | null;
}

/**
 * Every operation names a pack by its lock id; the renderer never supplies a
 * URL or a path. `download` and `resume` return once the transfer starts, and
 * its outcome arrives through `onChange`.
 */
export interface FeaturePackBridge {
  list(): Promise<FeaturePackSnapshot[]>;
  get(id: string): Promise<FeaturePackSnapshot>;
  download(id: string): Promise<void>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  cancel(id: string): Promise<void>;
  check(id: string): Promise<FeaturePackSnapshot>;
  remove(id: string): Promise<void>;
  onChange(listener: (change: FeaturePackChange) => void): () => void;
}
