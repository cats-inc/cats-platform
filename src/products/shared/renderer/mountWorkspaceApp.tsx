import React, { type ComponentType } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { sharedQueryClient } from './queryClient.js';
import { installBrowserErrorDiagnostics } from './browserDiagnostics.js';

export function mountWorkspaceApp(AppComponent: ComponentType) {
  const stopErrorDiagnostics = installBrowserErrorDiagnostics();
  import.meta.hot?.dispose(stopErrorDiagnostics);
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={sharedQueryClient}>
        <BrowserRouter useTransitions={false}>
          <AppComponent />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
