import React, { type ComponentType } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { sharedQueryClient } from './queryClient.js';

export function mountWorkspaceApp(AppComponent: ComponentType) {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={sharedQueryClient}>
        <BrowserRouter unstable_useTransitions={false}>
          <AppComponent />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
