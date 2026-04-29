/**
 * Mobile-safe message body surface.
 *
 * This module re-exports the shared segmenter and its types so the React
 * Native client at `cats-platform/mobile/` can import them without
 * pulling in any Node-only / desktop-only modules through transitive
 * imports. The segmenter was narrowed (commit on the same slice) to
 * depend on a local `MentionResolverCat` interface instead of the heavy
 * `ChatCat` from `workspaceContracts.ts`, which kept this re-export
 * free of `node:crypto` etc.
 *
 * SPEC-095 NFR-001 — mobile shall reuse the shared segmenter "without
 * modification" — is satisfied by this module: mobile imports the
 * canonical segmenter via this boundary instead of re-declaring its
 * shape.
 */

export {
  extractAttachments,
  segmentMessageBody,
  type MentionResolverCat,
  type MessageBodyAttachment,
  type MessageBodySegment,
  type MessageBodySegmentKind,
} from '../products/shared/renderer/components/messageBodySegmenter.js';
