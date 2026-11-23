import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev the API runs separately on :3001; in production Express serves the built client.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
