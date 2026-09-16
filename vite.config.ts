import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'A.S.T.R.A. - Antarctic Supply Tracking & Resource Analytics',
        short_name: 'ASTRA',
        description: 'Offline-first Antarctic station logistics prototype for SIH26062.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone'
      }
    })
  ]
})
