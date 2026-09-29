import Markdown, { type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { ArtifactCanvasProjection } from '../../artifactCanvas/contracts.js';
import { MESSAGE_BODY_MARKDOWN_COMPONENTS } from '../components/MessageBodyMarkdown.js';
import { ArtifactCanvasTextStatus, useArtifactCanvasText } from './useArtifactCanvasText.js';

export interface MarkdownViewerProps {
  projection: ArtifactCanvasProjection;
}

/**
 * Documents are usually hard-wrapped, so unlike chat replies a single newline
 * stays a soft break (no `remark-breaks`), and chat mentions do not apply.
 */
const DOCUMENT_REMARK_PLUGINS: Options['remarkPlugins'] = [remarkGfm];

/**
 * Renders a Markdown artifact with the chat markdown renderer's rules: raw HTML
 * is shown as text, unsafe URL protocols are dropped, remote images are not
 * loaded and local or relative links stay inert.
 */
export function MarkdownViewer({ projection }: MarkdownViewerProps): JSX.Element {
  const state = useArtifactCanvasText(projection);
  if (state.status !== 'ready') {
    return <ArtifactCanvasTextStatus state={state} />;
  }

  return (
    <article className="artifactCanvasMarkdown messageBodyMarkdown">
      <Markdown
        remarkPlugins={DOCUMENT_REMARK_PLUGINS}
        components={MESSAGE_BODY_MARKDOWN_COMPONENTS}
      >
        {state.text}
      </Markdown>
    </article>
  );
}
