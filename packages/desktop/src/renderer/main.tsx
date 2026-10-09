import { App, type Platform } from '@mifs/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

declare global {
  interface Window {
    api: Platform;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={window.api} />
  </StrictMode>,
);
