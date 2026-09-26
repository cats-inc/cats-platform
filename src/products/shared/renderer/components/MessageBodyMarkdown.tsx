import { memo, useMemo } from 'react';
import Markdown, { type Components, type Options } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { isInternalProductRoute, type MentionResolverCat } from './messageBodySegmenter.js';
import { remarkMessageBodySegments } from './messageBodyMarkdownSegments.js';

export interface MessageBodyMarkdownProps {
  text: string;
  cats: MentionResolverCat[];
  disabledMentionNames: string[];
}

/** The Desktop host only hands http(s) URLs to the system browser. */
const EXTERNAL_URL_REGEX = /^https?:\/\//i;

const MARKDOWN_COMPONENTS: Components = {
  a({ href, children }) {
    if (href && isInternalProductRoute(href)) {
      return <Link className="messageBodyLink" to={href}>{children}</Link>;
    }
    if (href && EXTERNAL_URL_REGEX.test(href)) {
      return (
        <a className="messageBodyLink" href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }
    // Agents often link local files or anchors; following them would navigate the app shell.
    return <span className="messageBodyInertLink" title={href}>{children}</span>;
  },
  img({ src, alt }) {
    // Remote images are not loaded automatically, so a reply cannot trigger requests on render.
    const label = alt || src || '';
    if (src && EXTERNAL_URL_REGEX.test(src)) {
      return (
        <a className="messageBodyLink" href={src} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      );
    }
    return <span>{label}</span>;
  },
  span({ node, ...props }) {
    const avatarColor = node?.properties.dataAvatarColor;
    return typeof avatarColor === 'string'
      ? <span {...props} style={{ background: avatarColor }} />
      : <span {...props} />;
  },
  table({ children }) {
    return (
      <div className="messageBodyTableScroll">
        <table>{children}</table>
      </div>
    );
  },
};

/**
 * Renders agent-authored markdown. Raw HTML is shown as text and unsafe URL
 * protocols are dropped by react-markdown's defaults; single newlines stay line
 * breaks to match how plain message bodies have always displayed.
 */
export const MessageBodyMarkdown = memo(function MessageBodyMarkdown({
  text,
  cats,
  disabledMentionNames,
}: MessageBodyMarkdownProps) {
  const remarkPlugins = useMemo<Options['remarkPlugins']>(
    () => [
      remarkGfm,
      remarkBreaks,
      [remarkMessageBodySegments, { cats, disabledMentionNames }],
    ],
    [cats, disabledMentionNames],
  );

  return (
    <div className="messageBodyMarkdown">
      <Markdown remarkPlugins={remarkPlugins} components={MARKDOWN_COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
});
