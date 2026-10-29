import { memo } from 'react';
import Markdown, { type Components, type Options } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

/** The host owns navigation. Remote images never load as a side effect of rendering. */
export const CONVERSATION_MARKDOWN_COMPONENTS: Components = {
  a({ href, children }) {
    return href && /^https?:\/\//i.test(href)
      ? <a className="messageBodyLink" href={href} target="_blank" rel="noopener noreferrer">{children}</a>
      : <span className="messageBodyInertLink" title={href}>{children}</span>;
  },
  img({ src, alt }) {
    const label = alt || src || '';
    return src && /^https?:\/\//i.test(src)
      ? <a className="messageBodyLink" href={src} target="_blank" rel="noopener noreferrer">{label}</a>
      : <span>{label}</span>;
  },
  span({ node, ...props }) {
    const color = node?.properties.dataAvatarColor;
    return typeof color === 'string' ? <span {...props} style={{ background: color }} /> : <span {...props} />;
  },
  table({ children }) { return <div className="messageBodyTableScroll"><table>{children}</table></div>; },
};

export const ConversationMarkdown = memo(function ConversationMarkdown({ text, components, plugins = [] }: {
  text: string;
  components?: Components;
  plugins?: Options['remarkPlugins'];
}) {
  return <div className="messageBodyMarkdown">
    <Markdown remarkPlugins={[remarkGfm, remarkBreaks, ...(plugins ?? [])]}
      components={components ?? CONVERSATION_MARKDOWN_COMPONENTS}>{text}</Markdown>
  </div>;
});
