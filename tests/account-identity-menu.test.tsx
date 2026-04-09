import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import {
  AccountIdentityMenu,
  shouldDismissAccountIdentityMenu,
} from '../src/design/components/AccountIdentityMenu.tsx';

test('AccountIdentityMenu renders shared account actions with configurable placement', () => {
  const markup = renderToStaticMarkup(
    <AccountIdentityMenu
      open
      onOpenChange={() => {}}
      onNavigateSettings={() => {}}
      runtimeBaseUrl="http://localhost:8484"
      triggerClassName="lobbyIdentity"
      menuPlacement="below"
      menuAlignment="end"
      avatar={<span className="lobbyAvatar">K</span>}
      meta={<span className="lobbyOwnerName">Ken</span>}
      statusIndicator={<span className="lobbyIdentityDot lobbyIdentityDot--ok" />}
    />,
  );

  assert.match(markup, /class="lobbyIdentity"/u);
  assert.match(markup, /aria-haspopup="menu"/u);
  assert.match(markup, /aria-expanded="true"/u);
  assert.match(markup, /accountMenu--below/u);
  assert.match(markup, /accountMenu--alignEnd/u);
  assert.match(markup, />Settings</u);
  assert.match(markup, />Environment</u);
  assert.doesNotMatch(markup, />Cats Runtime</u);
});

test('shouldDismissAccountIdentityMenu only dismisses pointer targets outside the menu root', () => {
  const insideTarget = { id: 'inside' } as unknown as Node;
  const outsideTarget = { id: 'outside' } as unknown as Node;
  const root = {
    contains(target: Node | null) {
      return target === insideTarget;
    },
  } as Pick<Node, 'contains'>;

  assert.equal(shouldDismissAccountIdentityMenu(root, insideTarget), false);
  assert.equal(shouldDismissAccountIdentityMenu(root, outsideTarget), true);
  assert.equal(shouldDismissAccountIdentityMenu(null, outsideTarget), false);
  assert.equal(shouldDismissAccountIdentityMenu(root, null), false);
});
