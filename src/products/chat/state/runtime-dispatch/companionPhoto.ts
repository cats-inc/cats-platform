import type { CompanionSessionContext } from '../../../../core/companionContracts.js';
import type { RuntimeMessageSegment } from '../../../../platform/runtime/client.js';
import { isCompanionCat } from '../../../../shared/companionRole.js';
import type { ChatState } from '../../api/contracts.js';
import {
  attachCompanionAlbumPhoto,
  buildCompanionPhotoTransportMetadata,
  extractCompanionPhotoDirective,
  formatCompanionPhotoAttachmentBlock,
} from '../../companion/life/photos.js';

/**
 * SPEC-124 FR-32: a companion Cat's ordinary reply may carry a
 * `[photo: <path>]` line. The line never reaches the owner; a photo inside the
 * album is attached to the reply's last text segment, which becomes the
 * terminal message that transports read.
 */
export async function applyCompanionPhotoDirective(input: {
  state: ChatState;
  channelId: string;
  companionSession: Pick<CompanionSessionContext, 'catId' | 'photoAlbum'> | null;
  segments: RuntimeMessageSegment[];
  runtimeDataDir?: string | null;
}): Promise<{ segments: RuntimeMessageSegment[]; metadata: Record<string, unknown> | null }> {
  const unchanged = { segments: input.segments, metadata: null };
  const catId = input.companionSession?.catId;
  if (!isCompanionCat(input.state.cats.find((cat) => cat.id === catId))) {
    return unchanged;
  }
  let requested: string | null = null;
  let lastTextIndex = -1;
  const segments = input.segments.map((segment, index) => {
    if (segment.kind !== 'text') {
      return segment;
    }
    lastTextIndex = index;
    const extracted = extractCompanionPhotoDirective(segment.text);
    if (extracted.requested === null) {
      return segment;
    }
    requested ??= extracted.requested;
    return { ...segment, text: extracted.body };
  });
  if (requested === null) {
    return unchanged;
  }

  const photo = await attachCompanionAlbumPhoto({
    state: input.state,
    laneId: input.channelId,
    album: input.companionSession?.photoAlbum ?? null,
    requested,
    runtimeDataDir: input.runtimeDataDir,
  });
  if (!photo) {
    // Keep the Cat's own words; when the directive was all it said, show that
    // rather than letting a generic "no text output" line speak for it.
    const saidSomething = segments.some((segment) =>
      segment.kind === 'text' && segment.text.trim().length > 0);
    return saidSomething ? { segments, metadata: null } : unchanged;
  }
  const last = segments[lastTextIndex];
  if (last?.kind === 'text') {
    segments[lastTextIndex] = { ...last, text: `${formatCompanionPhotoAttachmentBlock(photo)}${last.text}` };
  }
  return { segments, metadata: buildCompanionPhotoTransportMetadata(photo) };
}
