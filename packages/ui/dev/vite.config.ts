import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// UI-only dev harness: runs the app in a normal browser against the mock Platform.
export default defineConfig({ root: __dirname, plugins: [react(), tailwindcss()], server: { port: 5199, strictPort: true } });
