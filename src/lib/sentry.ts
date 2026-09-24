import * as Sentry from '@sentry/react';

// Error monitoring. No-op when VITE_SENTRY_DSN is unset (e.g. local dev).
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __COMMIT_SHA__,
    // Only report from deployed builds. PII (IPs, cookies) is not sent by default.
    enabled: import.meta.env.PROD,
  });
}

export const sentryErrorHandler = Sentry.reactErrorHandler;
