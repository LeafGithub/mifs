import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';


// Strict CSP for the app's own page. Injected only into production builds: the dev server needs inline scripts and a
// websocket for hot reload, and a <meta> CSP is the only option because file:// loads have no response headers.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export default defineConfig({
  // Everything is bundled into the main process too, so the packaged app needs no node_modules.
  main: { build: { externalizeDeps: false } },
  // Sandboxed preloads cannot require() node_modules, so everything is bundled into the preload.
  preload: { build: { externalizeDeps: false } },
  renderer: {
    // Never inline assets as data: URIs (small font subsets would be): the production CSP only allows font-src 'self'.
    build: { assetsInlineLimit: 0 },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'inject-csp',
        transformIndexHtml: {
          order: 'post',
          handler: (html, ctx) => (ctx.server ? html : html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`)),
        },
      },
    ],
  },
});
