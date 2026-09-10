import { createRoot } from 'react-dom/client';
import { AppRendererSurface } from '../../src/app/renderer/AppRendererSurface.js';
import { installCsrfFetch } from '../../src/app/renderer/csrfFetch.js';

installCsrfFetch();
createRoot(document.getElementById('root')!).render(<AppRendererSurface appId="cats.usage" version={new URLSearchParams(location.search).get('appVersion') ?? ''}
  title="Usage" locale={new URLSearchParams(location.search).get('locale') ?? 'zh-TW'}
  onLobby={() => { document.body.textContent = 'Returned to lobby'; }} />);
