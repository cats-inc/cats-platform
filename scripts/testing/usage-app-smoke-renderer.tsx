import { createRoot } from 'react-dom/client';
import { AppRendererSurface } from '../../src/app/renderer/AppRendererSurface.js';

createRoot(document.getElementById('root')!).render(<AppRendererSurface appId="cats.usage" version="0.1.0"
  title="Usage" locale={new URLSearchParams(location.search).get('locale') ?? 'zh-TW'}
  onLobby={() => { document.body.textContent = 'Returned to lobby'; }} />);
