/**
 * Local re-declaration of the shared segmenter's output shape. Mirrors
 * `cats-platform/src/products/shared/renderer/components/messageBodySegmenter.ts`
 * exactly. SPEC-095 NFR-001 requires the real segmenter to be imported by
 * mobile without modification — this file disappears once Metro is wired
 * to resolve `cats-platform/src/...` from the mobile workspace. Until
 * then, edits here MUST stay in lockstep with the shared file.
 */

export interface MessageBodyAttachment {
  filename: string;
  relativePath: string;
  isImage: boolean;
}

export type MessageBodySegmentKind = 'text' | 'url' | 'mention';

export interface MessageBodySegment {
  kind: MessageBodySegmentKind;
  value: string;
  href?: string;
  avatarColor?: string | null;
}
