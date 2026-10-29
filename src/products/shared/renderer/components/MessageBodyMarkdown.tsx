import { memo, useMemo } from 'react';
import { type Components, type Options } from 'react-markdown';
import { Link } from 'react-router-dom';
import { ConversationMarkdown, CONVERSATION_MARKDOWN_COMPONENTS } from '@cats-inc/platform-ui-web';
import { isInternalProductRoute, type MentionResolverCat } from './messageBodySegmenter.js';
import { remarkMessageBodySegments } from './messageBodyMarkdownSegments.js';

export interface MessageBodyMarkdownProps {
  text: string;
  cats: MentionResolverCat[];
  disabledMentionNames: string[];
}

export const MESSAGE_BODY_MARKDOWN_COMPONENTS: Components = {
  ...CONVERSATION_MARKDOWN_COMPONENTS,
  a({ href, children }) {
    if (href && isInternalProductRoute(href)) return <Link className="messageBodyLink" to={href}>{children}</Link>;
    return href && /^https?:\/\//i.test(href)
      ? <a className="messageBodyLink" href={href} target="_blank" rel="noopener noreferrer">{children}</a>
      : <span className="messageBodyInertLink" title={href}>{children}</span>;
  },
};

export const MessageBodyMarkdown = memo(function MessageBodyMarkdown({ text, cats, disabledMentionNames }: MessageBodyMarkdownProps) {
  const plugins = useMemo<Options['remarkPlugins']>(
    () => [[remarkMessageBodySegments, { cats, disabledMentionNames }]], [cats, disabledMentionNames]);
  return <ConversationMarkdown text={text} components={MESSAGE_BODY_MARKDOWN_COMPONENTS} plugins={plugins} />;
});
