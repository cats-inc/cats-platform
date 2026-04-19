import {
  NewChatDraft as SharedNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';

export type { NewChatDraftProps };

export function NewChatDraft(props: NewChatDraftProps) {
  return <SharedNewChatDraft {...props} surfaceTag={<ComposerSurfaceChip surface="work" />} />;
}
