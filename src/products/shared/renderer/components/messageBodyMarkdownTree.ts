import type { Root, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { newlineToBreak } from 'mdast-util-newline-to-break';
import { gfm } from 'micromark-extension-gfm';

import {
  remarkMessageBodySegments,
  type MessageBodyMarkdownSegmentOptions,
} from './messageBodyMarkdownSegments.js';

export {
  readMarkdownMention,
  type MarkdownMention,
  type MessageBodyMarkdownSegmentOptions,
} from './messageBodyMarkdownSegments.js';

export type MessageBodyMarkdownRoot = Root;
export type MessageBodyMarkdownNode = RootContent;

/**
 * Parses an agent message body into the same markdown tree the web renderer
 * builds with react-markdown, remark-gfm, remark-breaks and
 * `remarkMessageBodySegments`, for renderers that draw the tree themselves
 * (the React Native client).
 *
 * It calls the micromark and mdast utilities directly rather than unified, so
 * the React Native bundle carries only the parser and none of unified's vfile
 * plumbing (which relies on `#minpath`-style package subpath imports).
 */
export function parseMessageBodyMarkdown(
  text: string,
  options: MessageBodyMarkdownSegmentOptions,
): MessageBodyMarkdownRoot {
  const tree = fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  newlineToBreak(tree);
  remarkMessageBodySegments(options)(tree);
  return tree;
}
