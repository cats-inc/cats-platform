/** Persisted, browser-safe publication contracts (SPEC-143). Filesystem access stays in the host. */
export interface CompanionMediaAsset {
  id: string;
  catId: string;
  kind: 'image' | 'video';
  fileName: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  durationSeconds: number | null;
  origin: 'source' | 'avatar' | 'cover' | 'generated';
  sourceIds: string[];
  jobId: string | null;
  createdAt: string;
}

export interface CompanionPostAttachment {
  assetId: string;
  alt: string;
}

export interface CompanionPublicationIntent {
  id: string;
  postId: string;
  catId: string;
  requestKey: string;
  requestHash: string;
  state: 'waiting_for_media' | 'ready' | 'published' | 'failed' | 'cancelled';
  title: string | null;
  body: string;
  attachments: CompanionPostAttachment[];
  pendingJobIds: string[];
  sourceIds: string[];
  tags: string[];
  trigger: 'owner' | 'heartbeat';
  actionId?: string;
  heartbeatKind?: string;
  share: boolean;
  notify: Array<'dm' | 'telegram'>;
  followupState?: 'pending' | 'blocked' | 'complete';
  followupContext?: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionShareGrant {
  id: string;
  catId: string;
  postId: string;
  /** Private persistence only: needed to reproduce an idempotent link after an origin change. */
  token: string;
  tokenHash: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface CompanionNotificationIntent {
  id: string;
  catId: string;
  postId: string;
  revision: number;
  destination: 'dm' | 'telegram';
  /** Host-selected, pinned recipient; never populated from model arguments. */
  target?: Record<string, string>;
  shareGrantId?: string;
  trigger?: 'owner' | 'heartbeat';
  attempts?: number;
  state: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'suppressed';
  transportMessageId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionMediaSettings {
  catId: string;
  coverAssetId: string | null;
  useProfileImages: boolean;
  autoPost: boolean;
  autoShare: boolean;
  notify: Array<'dm' | 'telegram'>;
  dailyLimit: number;
  intervalMinutes: number;
  updatedAt: string;
}

export interface CompanionPublicationState {
  mediaAssets: CompanionMediaAsset[];
  publicationIntents: CompanionPublicationIntent[];
  shareGrants: CompanionShareGrant[];
  notificationIntents: CompanionNotificationIntent[];
  mediaSettings: CompanionMediaSettings[];
}
