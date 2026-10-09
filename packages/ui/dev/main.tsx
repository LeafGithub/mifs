import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, createMockPlatform } from '../src';
import { MOCK_BUNDLE } from '../src/mock';
import './styles.css';

// `?empty` shows the first-run state; otherwise one bundle is already installed.
const empty = new URLSearchParams(location.search).has('empty');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={createMockPlatform({ bundles: empty ? [] : [MOCK_BUNDLE] })} />
  </StrictMode>,
);
