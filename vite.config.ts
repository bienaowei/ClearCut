import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: Number(process.env.PORT) || 5173,
  },
  worker: {
    format: 'es',
  },
});
