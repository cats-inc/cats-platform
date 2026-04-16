import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { TranscriptMessageActions } from '../src/products/chat/renderer/components/chat-view/TranscriptMessageActions.tsx';

test('chat transcript message actions keep copy and relay controls available for compare groups', () => {
  const markup = renderToStaticMarkup(
    <TranscriptMessageActions
      messageId="message-agent"
      messageBody="Agent answer"
      senderKind="agent"
      compareBusy={false}
      isCompareGroup
      relayMenuOpen
      onCopyMessage={async () => {}}
      onToggleRelayMenu={() => {}}
      onCloseRelayMenu={() => {}}
      onRelayMessage={async () => {}}
    />,
  );

  assert.match(markup, /title="Copy message"/u);
  assert.match(markup, /title="Relay to others"/u);
  assert.match(markup, /Check with others/u);
  assert.match(markup, /Synthesize with others/u);
});
