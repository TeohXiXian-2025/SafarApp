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
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
