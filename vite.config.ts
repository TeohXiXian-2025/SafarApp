import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
import {vercelApiDev} from './scripts/vite-api-dev';

// ---------------------------------------------------------------------------
// Installable app (PWA): manifest for "Add to Home Screen" + a Workbox service
// worker that precaches the app shell so it opens instantly and offline.
// Trip data itself is cached offline by Firestore (IndexedDB), not the SW.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Installable on phones/tablets only. Browsers offer "Install" whenever the page
// links a manifest, so the build strips the plugin's <link rel="manifest"> and an
// inline script adds it back only on mobile devices. Laptops/desktops never see
// an install option (the service worker still runs there for speed/offline).
// Keep the device test in sync with isMobileDevice() in src/pwa/pwa.ts.
// ---------------------------------------------------------------------------
function manifestOnMobileOnly(): Plugin {
  const script = `<script>(function(){var n=navigator,u=n.userAgent;var m=(n.userAgentData&&n.userAgentData.mobile)||/Android|iPhone|iPad|iPod|Mobile/i.test(u)||(n.platform==='MacIntel'&&n.maxTouchPoints>1);if(m){var l=document.createElement('link');l.rel='manifest';l.href='/manifest.webmanifest';document.head.appendChild(l);}})();</script>`;
  return {
    name: 'safar-manifest-mobile-only',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html, ctx) =>
        // Only the app page — the pitch deck isn't an app.
        ctx.path.endsWith('pitch.html') ? html.replace(/\s*<link rel="manifest"[^>]*>/, '') : html.replace(/<link rel="manifest"[^>]*>/, script),
    },
  };
}

const pwa = VitePWA({
  registerType: 'prompt', // show an "Update available" toast instead of silently swapping versions
  injectRegister: false, // registered from React (src/pwa/UpdatePrompt.tsx)
  includeAssets: ['favicon.svg', 'favicon-32.png', 'icons/apple-touch-icon.png'],
  manifest: {
    id: '/',
    name: 'Safar — Halal Group Travel',
    short_name: 'Safar',
    description: 'Plan group trips around halal food and prayer times — together.',
    lang: 'en',
    start_url: '/trips',
    scope: '/',
    display: 'standalone',
    theme_color: '#00685F',
    background_color: '#FAF8F5',
    categories: ['travel', 'lifestyle'],
    // Android: "Share → Safar" from TikTok / Instagram / Xiaohongshu (not supported on iOS).
    share_target: {action: '/share', method: 'GET', params: {title: 'title', text: 'text', url: 'url'}},
    icons: [
      {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    // Push notification handlers (public/push-sw.js).
    importScripts: ['push-sw.js'],
    // The pitch deck is a separate page with big images — don't ship it to every phone.
    // Pitch-deck screenshots and the /demo prototype's code load on demand instead.
    globIgnores: ['pitch.html', 'assets/pitch-*', 'assets/*.png', 'assets/*.jpg', 'images/**', 'assets/App-*', 'assets/pdf-*', 'assets/motion-*'],
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    navigateFallback: '/index.html',
    // Server routes and Firebase's auth handler must always hit the network.
    navigateFallbackDenylist: [/^\/api\//, /^\/__\//, /^\/pitch/],
    cleanupOutdatedCaches: true,
    // Control the page right after the FIRST install, so the app works offline
    // without needing a reload. Later updates still wait for the user's "Update" tap.
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: ({url}) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
        handler: 'CacheFirst',
        options: {cacheName: 'google-fonts', expiration: {maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365}},
      },
      {
        // Avatars from Google accounts
        urlPattern: ({url}) => url.hostname.endsWith('googleusercontent.com'),
        handler: 'StaleWhileRevalidate',
        options: {cacheName: 'avatars', expiration: {maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30}},
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// Build stamp
// Identifies exactly which commit a deployment was built from, so a live site
// can always be compared against `git rev-parse HEAD` locally.
// Vercel sets VERCEL_GIT_COMMIT_SHA, GitHub Actions sets GITHUB_SHA.
// ---------------------------------------------------------------------------
const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  'local-dev';

function buildStamp(): Plugin {
  return {
    name: 'safar-build-stamp',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `  <meta name="build-commit" content="${commitSha}" />\n  </head>`,
      );
    },
  };
}

export default defineConfig(() => {
  return {
    // Absolute base: the app is served from the domain root on Vercel.
    // './' (relative) was only needed for the retired GitHub Pages project-site
    // build, and it breaks asset URLs on deep links when combined with
    // vercel.json's catch-all rewrite.
    base: '/',
    define: {
      __COMMIT_SHA__: JSON.stringify(commitSha),
    },
    plugins: [react(), tailwindcss(), buildStamp(), vercelApiDev(), pwa, manifestOnMobileOnly()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Remaining >500 kB chunks are third-party vendors (firebase, misc
      // vendor code) that are cached and loaded once. App logic itself is
      // now ~457 kB after splitting.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          pitch: path.resolve(__dirname, 'pitch.html'),
        },
        output: {
          // Split oversized vendor libraries into separate, cacheable chunks
          // instead of one >500 kB bundle. Improves repeat-visit performance
          // and removes the Rollup chunk-size warning.
          manualChunks(id: string) {
            // Rollup's own helpers (virtual "\0" modules, e.g. commonjsHelpers) are
            // shared by every chunk — keep them in vendor, otherwise they can land in
            // a lazy chunk (e.g. pdf) and force it to load on startup.
            if (id.startsWith('\0')) return 'vendor';
            if (!id.includes('node_modules')) return;
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler'))
              return 'react-vendor';
            if (id.includes('motion')) return 'motion';
            if (id.includes('@sentry')) return 'sentry';
            if (id.includes('react-router')) return 'router';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('firebase') || id.includes('@firebase')) return 'firebase';
            if (id.includes('jspdf')) return 'pdf';
            if (id.includes('@vis.gl') || id.includes('google')) return 'maps-ai';
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
