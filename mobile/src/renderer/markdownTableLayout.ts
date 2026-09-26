import type { MessageBodyMarkdownNode } from '../../../src/mobile/index.js';

export type MarkdownTable = Extract<MessageBodyMarkdownNode, { type: 'table' }>;

const MIN_COLUMN_WIDTH = 64;
const MAX_COLUMN_WIDTH = 220;
/** `.messageBodyMarkdown :where(th, td)` horizontal padding plus the cell border. */
const CELL_HORIZONTAL_CHROME = 21;
/** Approximate advance of a Latin character at the bubble font size. */
const NARROW_CHARACTER_WIDTH = 7.5;
const WIDE_CHARACTER_REGEX =
  /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/**
 * React Native has no table layout, so every row lays out its cells with one
 * shared width per column. Widths are estimated from each column's longest cell
 * text (CJK characters count double) and clamped, letting long cells wrap.
 */
export function estimateTableColumnWidths(table: MarkdownTable): number[] {
  const widths: number[] = [];
  for (const row of table.children) {
    row.children.forEach((cell, column) => {
      const width = clamp(estimateTextWidth(readPlainText(cell)) + CELL_HORIZONTAL_CHROME);
      widths[column] = Math.max(widths[column] ?? MIN_COLUMN_WIDTH, width);
    });
  }
  return widths;
}

function estimateTextWidth(text: string): number {
  let units = 0;
  for (const character of text) {
    units += WIDE_CHARACTER_REGEX.test(character) ? 2 : 1;
  }
  return units * NARROW_CHARACTER_WIDTH;
}

function readPlainText(node: MessageBodyMarkdownNode): string {
  if ('value' in node) {
    return node.value;
  }
  let text = '';
  if ('children' in node) {
    for (const child of node.children) {
      text += readPlainText(child);
    }
  }
  return text;
}

function clamp(width: number): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}
