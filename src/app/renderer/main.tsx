import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import '../../design/index.css';
import App from './App';
import { initTooltipPortal } from '../../products/chat/renderer/tooltipPortal';
import { sharedQueryClient } from '../../products/shared/renderer/queryClient.js';

initTooltipPortal();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={sharedQueryClient}>
      <BrowserRouter unstable_useTransitions={false}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
