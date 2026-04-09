import React, { type ComponentType } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

export function mountWorkspaceApp(AppComponent: ComponentType) {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <AppComponent />
      </BrowserRouter>
    </React.StrictMode>,
  );
}
