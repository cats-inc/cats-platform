import {
  NewChatDraft as SharedNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerModeChip } from '../../../shared/renderer/components/ComposerModeChip.js';

export type { NewChatDraftProps };

export function NewChatDraft(props: NewChatDraftProps) {
  return <SharedNewChatDraft {...props} modeTag={<ComposerModeChip mode="work" />} />;
}
