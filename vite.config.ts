import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

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
    plugins: [react(), tailwindcss(), buildStamp()],
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
        output: {
          // Split oversized vendor libraries into separate, cacheable chunks
          // instead of one >500 kB bundle. Improves repeat-visit performance
          // and removes the Rollup chunk-size warning.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler'))
              return 'react-vendor';
            if (id.includes('motion')) return 'motion';
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
