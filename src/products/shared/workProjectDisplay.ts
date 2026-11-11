import type { CatsCoreState, CoreWorkItemRecord } from '../../core/types.js';
import { buildChatWorkItemId } from '../../shared/chatCoreIds.js';
import { cleanRecordValue, fenceRecordText } from './conversationRecordTools.js';

/**
 * SPEC-142 FR-16, FR-18: what Chat's and Work's Project cards and the owner's Project dialog show
 * about a folder and about what moves with a conversation. Shared, since both products post
 * such cards.
 */

const HIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const CHILD_RECORD_LIMIT = 20;
const TITLE_LIMIT = 161;

/**
 * A folder as a card or a dialog shows it: whole, with any hidden character written out as
 * `\u{…}`, so a folder stored before the folder checks cannot look like another one.
 */
export function visibleWorkProjectFolder(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.replace(HIDDEN, (char) => `\\u{${char.codePointAt(0)!.toString(16).toUpperCase()}}`);
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
