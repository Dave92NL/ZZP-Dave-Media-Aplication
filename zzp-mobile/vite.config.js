import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'ZZP Manager Mobile',
        short_name: 'ZZP Mobile',
        description: 'Dodawanie kosztów i faktur z telefonu — ZZP Manager',
        theme_color: '#0D1117',
        background_color: '#0D1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Precache the app shell only — Supabase API/Storage calls are never
        // intercepted or cached (no offline data support by design).
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallbackDenylist: [/^\/supabase/]
      }
    })
  ]
});
