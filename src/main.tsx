import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {RouterProvider} from 'react-router';
import {router} from './router';
import {initSentry, sentryErrorHandler} from './lib/sentry';
import './index.css';

// Build stamp injected by vite.config.ts (`define`). Lets you confirm which
// commit a live deployment is actually running: check the console here, the
// <meta name="build-commit"> tag in the page source, or this attribute.
document.documentElement.dataset.buildCommit = __COMMIT_SHA__;
console.info(`[Safar] build ${__COMMIT_SHA__}`);

initSentry();

createRoot(document.getElementById('root')!, {
  onUncaughtError: sentryErrorHandler(),
  onCaughtError: sentryErrorHandler(),
}).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
