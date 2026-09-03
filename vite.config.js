import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        // Las dependencias grandes van a trozos propios para que se cacheen entre
        // despliegues: cambiar una página no invalida React ni recharts.
        // recharts solo lo usan el dashboard, el comparativo y los informes, así
        // que quien no entra ahí no lo descarga.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          datos: ['@tanstack/react-query', 'axios', 'zustand', 'date-fns'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
