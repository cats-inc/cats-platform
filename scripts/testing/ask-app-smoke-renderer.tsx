import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRendererSurface } from '../../src/app/renderer/AppRendererSurface.js';

function Fixture() {
  const [open, setOpen] = useState(true);
  return <><button id="toggle" onClick={() => setOpen(value => !value)}>{open ? 'Close App' : 'Open App'}</button>
    <textarea id="paste-target" aria-label="Clipboard verification" />
    {open && <AppRendererSurface appId="cats.ask" version="0.1.0" title="Ask" locale="zh-TW" onLobby={() => setOpen(false)} />}</>;
}
createRoot(document.querySelector('#root')!).render(<Fixture />);
