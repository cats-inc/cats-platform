import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import {
  RelayActionIcon,
  TranscriptMessageActions,
} from '../src/products/shared/renderer/components/chat-view/TranscriptMessageActions.tsx';

test('chat transcript message actions keep copy and relay controls available for compare groups', () => {
  const markup = renderToStaticMarkup(
    <TranscriptMessageActions
      senderKind="agent"
      showDefaultCopyAction
      onCopyMessage={() => {}}
      extraActions={[{
        key: 'relay:message-agent',
        kind: 'menu',
        title: 'Relay to others',
        icon: <RelayActionIcon />,
        open: true,
        onToggle: () => {},
        items: [
          {
            key: 'check_this',
            label: 'Check with others',
            onSelect: () => {},
          },
          {
            key: 'synthesize_this',
            label: 'Synthesize with others',
            onSelect: () => {},
          },
        ],
      }]}
    />,
  );

  assert.match(markup, /title="Copy message"/u);
  assert.match(markup, /title="Relay to others"/u);
  assert.match(markup, /Check with others/u);
  assert.match(markup, /Synthesize with others/u);
});
