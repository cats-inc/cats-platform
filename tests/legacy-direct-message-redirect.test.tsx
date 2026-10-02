import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  LEGACY_DIRECT_MESSAGE_SURFACES,
  resolveLegacyDirectMessageRedirectPath,
} from '../src/app/renderer/productShell/LegacyDirectMessageRedirect.tsx';

// ADR-129: direct messages are Chat-owned. Old Code/Work DM URLs forward
// to Chat's DM at the platform router, before the Code or Work app boots.
test('legacy Code and Work direct-message URLs forward to the Chat direct message', () => {
  assert.deepEqual([...LEGACY_DIRECT_MESSAGE_SURFACES], ['code', 'work']);
  assert.equal(resolveLegacyDirectMessageRedirectPath('companion-cat'), '/chat/dm/companion-cat');
  assert.equal(resolveLegacyDirectMessageRedirectPath('companion/cat'), '/chat/dm/companion%2Fcat');
});

test('the platform router registers the legacy direct-message redirects', async () => {
  const appSource = await readFile(
    path.join(process.cwd(), 'src', 'app', 'renderer', 'App.tsx'),
    'utf8',
  );

  // `/{prefix}/dm/:catId` outranks the `/{prefix}/*` product splat, so the
  // redirect wins without booting the Code or Work app.
  assert.match(
    appSource,
    /LEGACY_DIRECT_MESSAGE_SURFACES\.map\([\s\S]*?routePrefix\}\/dm\/:catId`\}[\s\S]*?<LegacyDirectMessageRedirect \/>/u,
  );
});
