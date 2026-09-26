import type { Link, Parent, RootContent, Text } from 'mdast';
// Declares the `hName` / `hProperties` node data that turns a mention into a span.
import type {} from 'mdast-util-to-hast';

import {
  segmentMessageBody,
  type MentionResolverCat,
  type MessageBodySegment,
} from './messageBodySegmenter.js';

export interface MessageBodyMarkdownSegmentOptions {
  cats: MentionResolverCat[];
  disabledMentionNames: string[];
}

export interface MarkdownMention {
  avatarColor: string | null;
}

/** Link text stays literal: links cannot nest and mentions inside them are not pills. */
const LITERAL_TEXT_PARENT_TYPES = new Set(['link', 'linkReference']);
const MENTION_CLASS_NAME = 'messageBodyMention';

/**
 * Remark plugin that applies the plain-text message body rules inside markdown
 * prose: bare URLs, internal product routes and cat mentions.
 *
 * GFM literal autolinks are unwrapped back to text first, so a bare URL follows
 * the same segmenter rules in both formats (for example stopping at CJK
 * punctuation, which GFM would include in the link).
 */
export function remarkMessageBodySegments(options: MessageBodyMarkdownSegmentOptions) {
  return (tree: Parent): undefined => {
    rewriteChildren(tree, options);
  };
}

/** Reads the cat mention this plugin marked on a text node, for renderers that skip hast. */
export function readMarkdownMention(node: Text): MarkdownMention | null {
  const properties = node.data?.hProperties;
  const className = properties?.className;
  if (!Array.isArray(className) || !className.includes(MENTION_CLASS_NAME)) {
    return null;
  }
  const avatarColor = properties?.dataAvatarColor;
  return { avatarColor: typeof avatarColor === 'string' ? avatarColor : null };
}

function rewriteChildren(parent: Parent, options: MessageBodyMarkdownSegmentOptions): void {
  const merged: RootContent[] = [];
  for (const child of parent.children) {
    const literalAutolinkText = child.type === 'link' ? readLiteralAutolinkText(child) : null;
    if (literalAutolinkText !== null) {
      appendText(merged, literalAutolinkText);
      continue;
    }
    if (child.type === 'text') {
      appendText(merged, child.value);
      continue;
    }
    if ('children' in child && !LITERAL_TEXT_PARENT_TYPES.has(child.type)) {
      rewriteChildren(child, options);
    }
    merged.push(child);
  }
  parent.children = merged.flatMap((child) =>
    child.type === 'text' ? segmentText(child.value, options) : [child],
  );
}

function readLiteralAutolinkText(link: Link): string | null {
  const [child] = link.children;
  if (link.children.length !== 1 || child.type !== 'text') {
    return null;
  }
  const { url } = link;
  const text = child.value;
  return url === text || url === `http://${text}` || url === `mailto:${text}` ? text : null;
}

function appendText(nodes: RootContent[], value: string): void {
  const previous = nodes.at(-1);
  if (previous?.type === 'text') {
    previous.value += value;
    return;
  }
  nodes.push({ type: 'text', value });
}

function segmentText(value: string, options: MessageBodyMarkdownSegmentOptions): RootContent[] {
  return segmentMessageBody(value, options.cats, options.disabledMentionNames).map(toMarkdownNode);
}

function toMarkdownNode(segment: MessageBodySegment): Link | Text {
  switch (segment.kind) {
    case 'url':
    case 'route':
      return {
        type: 'link',
        url: segment.href ?? segment.value,
        children: [{ type: 'text', value: segment.value }],
      };
    case 'mention':
      return {
        type: 'text',
        value: segment.value,
        data: {
          hName: 'span',
          hProperties: {
            className: [MENTION_CLASS_NAME],
            dataAvatarColor: segment.avatarColor ?? undefined,
          },
        },
      };
    default:
      return { type: 'text', value: segment.value };
  }
}
