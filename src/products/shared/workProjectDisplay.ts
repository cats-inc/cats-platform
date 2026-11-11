import type { CatsCoreState, CoreWorkItemRecord } from '../../core/types.js';
import { buildChatWorkItemId } from '../../shared/chatCoreIds.js';
import { cleanRecordValue, fenceRecordText } from './conversationRecordTools.js';

/**
 * SPEC-142 FR-16, FR-18: what Chat's and Work's Project cards and the owner's Project dialog show
 * about a folder and about what moves with a conversation. Shared, since both products post
 * such cards.
 */

/** Hidden characters, and the mark's own opening bracket so the display stays one-to-one. */
const WRITTEN_OUT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}⟦]/gu;
const CHILD_RECORD_LIMIT = 20;
const TITLE_LIMIT = 161;

/**
 * A folder as a card or a dialog shows it: whole, with any hidden character written out as
 * `⟦U+200B⟧`, so a folder stored before the folder checks cannot look like another one. A literal
 * `⟦` is written out the same way, so no folder can spell another one's mark.
 */
export function visibleWorkProjectFolder(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.replace(WRITTEN_OUT, (char) => `⟦U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}⟧`);
}

/** The Work Items parented under the conversation's projected Work Item, which follow it into a Project. */
export function conversationChildWorkItems(core: CatsCoreState, channelId: string): CoreWorkItemRecord[] {
  const projectedId = buildChatWorkItemId(channelId);
  return core.workItems.filter((entry) => entry.parentWorkItemId === projectedId);
}

/** A card's lines, records and binding for the Work Items that move with the conversation. */
export function conversationMoveView(core: CatsCoreState, channelId: string) {
  const children = conversationChildWorkItems(core, channelId);
  return {
    children,
    fields: children.length > 0 ? [{ name: 'moves with it', value: `${children.length} Work Item${children.length === 1 ? '' : 's'}`
      + (children.some((entry) => entry.taskId) ? ', some with a Task' : '') }] : [],
    records: children.slice(0, CHILD_RECORD_LIMIT).map((entry) => ({
      kind: 'work_item' as const, id: cleanRecordValue(entry.id), title: fenceRecordText(entry.title, TITLE_LIMIT),
    })),
    binding: children.map((entry) => ({ id: entry.id, taskId: entry.taskId, updatedAt: entry.updatedAt })),
  };
}
