import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';

export type { NewChatDraftProps };

/**
 * Every Work entry renders through `ChatNewChatDraft`. The shell
 * (`WorkspaceProductApp`) handles `showDraftGroupAddButton`,
 * `hideDraftGroupHint`, and `hideDraftParallelHint` per preset for
 * surface='work', so this wrapper only layers on Work's surface chip.
 */
export function NewChatDraft(props: NewChatDraftProps) {
  return (
    <ChatNewChatDraft
      {...props}
      surfaceTag={<ComposerSurfaceChip surface="work" />}
    />
  );
}
