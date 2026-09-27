import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import '../../design/index.css';
import App from './App';
import { installCsrfFetch } from './csrfFetch';
import { initTooltipPortal } from '../../products/chat/renderer/tooltipPortal';
import { sharedQueryClient } from '../../products/shared/renderer/queryClient.js';
import { installBrowserErrorDiagnostics } from '../../products/shared/renderer/browserDiagnostics.js';

const stopErrorDiagnostics = installBrowserErrorDiagnostics();
import.meta.hot?.dispose(stopErrorDiagnostics);
installCsrfFetch();
initTooltipPortal();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={sharedQueryClient}>
      <BrowserRouter useTransitions={false}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
