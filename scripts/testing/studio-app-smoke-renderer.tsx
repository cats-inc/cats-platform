import { createRoot } from 'react-dom/client';
import { AppRendererSurface } from '../../src/app/renderer/AppRendererSurface.js';
import { installCsrfFetch } from '../../src/app/renderer/csrfFetch.js';

installCsrfFetch();
createRoot(document.getElementById('root')!).render(<AppRendererSurface appId="cats.studio"
  version={new URLSearchParams(location.search).get('appVersion') ?? ''} title="Studio" locale="zh-TW"
  onLobby={() => { document.body.textContent = 'Returned to lobby'; }} />);
