import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { ConfirmProvider } from '@/contexts/ConfirmContext'
import DemoBadge from '@/components/layout/DemoBadge'
import { recargarUnaVez } from '@/utils/cargaDiferida'
import './index.css'

// 22-oct · Vite avisa con este evento cuando no puede bajar un archivo de una
// versión anterior (CSS o dependencias de una página). Recargar toma la nueva.
window.addEventListener('vite:preloadError', (e) => {
  if (recargarUnaVez()) e.preventDefault()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5 },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfirmProvider>
          <App />
          <DemoBadge />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { fontSize: '13px', borderRadius: '10px', border: '1px solid #e5e7eb' },
            }}
          />
        </ConfirmProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
