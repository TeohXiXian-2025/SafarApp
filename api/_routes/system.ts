import { withAuth } from '../_lib/auth.js';
import { configuredServices } from '../_lib/env.js';
import { handle, json } from '../_lib/http.js';
import type { RouteTable } from '../_lib/routes.js';

export const systemRoutes: RouteTable = {
  // Public liveness check. Reports which integrations are configured
  // (true/false only) so a deploy can be verified without exposing secrets.
  'GET health': handle(async () =>
    json({ ok: true, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-dev', services: configuredServices() }),
  ),

  // The signed-in user as the server sees them.
  'GET me': withAuth(async (_req, { user }) => json({ uid: user.uid, email: user.email ?? null, name: user.name ?? null })),
};
