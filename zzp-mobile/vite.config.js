import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Aplikacja jest serwowana z GitHub Pages w podkatalogu o nazwie repo,
// czyli pod https://<user>.github.io/ZZP-Dave-Media-Aplication/ .
// Wszystkie ścieżki (assety, manifest, scope PWA) muszą uwzględniać ten prefiks.
const BASE = '/ZZP-Dave-Media-Aplication/';

export default defineConfig({
  base: BASE,
  plugins: [
    VitePWA({
      // 'prompt': nowy service worker czeka, a UI pokazuje pasek „Nowa wersja — Odśwież"
      // (rejestracja + obsługa w src/main.js przez virtual:pwa-register).
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: 'ZZP Manager Mobile',
        short_name: 'ZZP Mobile',
        description: 'Dodawanie kosztów i faktur z telefonu — ZZP Manager',
        theme_color: '#0A0E14',
        background_color: '#0A0E14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Precache the app shell only — dane trzymamy sami w IndexedDB, więc
        // wywołania Supabase API/Storage nie są przechwytywane ani cache'owane.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallbackDenylist: [/^\/supabase/],
        // Dołącz własny handler powiadomień push do generowanego service workera.
        importScripts: ['push-sw.js']
      }
    })
  ]
});
