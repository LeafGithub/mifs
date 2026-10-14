import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';


// Strict CSP for the app page, production builds only (the dev server needs inline scripts and a websocket).
// Set through <meta> because file:// loads have no response headers.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export default defineConfig({
  // Bundled into the main process too; no node_modules ship.
  main: { build: { externalizeDeps: false } },
  // Sandboxed preloads cannot require() node_modules, so bundle everything.
  preload: { build: { externalizeDeps: false } },
  renderer: {
    // No data: URI inlining; the production CSP only allows font-src 'self'.
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
