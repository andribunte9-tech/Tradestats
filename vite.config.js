import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Statt einer manifest.webmanifest-Datei generieren wir das Manifest hier.
      manifest: {
        name: 'TradeStats — Trading Journal',
        short_name: 'TradeStats',
        description: 'MT5-Live-Trading-Journal mit Mentor-Modus.',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      // Service-Worker-Strategie:
      //  - Statische Assets (App-Shell, JS, CSS) werden offline gecacht
      //  - Backend-API-Calls (localhost:8000) NICHT cachen — sonst sehen wir
      //    veraltete Trade-Daten. Wir filtern sie explizit aus.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // Limit cache size to avoid blowing up storage
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          // Niemals den lokalen Backend-Endpoint cachen
          {
            urlPattern: ({ url }) =>
              url.hostname === '127.0.0.1' || url.hostname === 'localhost',
            handler: 'NetworkOnly',
          },
        ],
      },
      // Dev-Modus: SW erst nach Build aktiv, damit HMR funktioniert
      devOptions: { enabled: false },
    }),
  ],
})
