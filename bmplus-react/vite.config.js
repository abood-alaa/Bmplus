import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2017',
    // React + the router change only on dependency upgrades, while app code changes
    // on every deploy. Splitting them means a content-hash change to app code
    // doesn't invalidate the (larger, stable) vendor chunk in visitors' caches.
    // The admin panel gets its own chunk automatically from the lazy() import in
    // App.jsx, so it isn't listed here.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api':     'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
})
