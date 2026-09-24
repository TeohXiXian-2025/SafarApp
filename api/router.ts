// The ONE Vercel function behind every /api/* URL.
//
// Vercel's Hobby plan allows at most 12 functions per deployment, and Safar
// needs far more endpoints than that, so vercel.json rewrites
//   /api/<path>  →  /api/router?__path=<path>
// and this file dispatches to handlers registered in api/_routes/*.
// Local dev does the same rewrite (scripts/vite-api-dev.ts).
import { json } from './_lib/http.js';
import type { RouteTable } from './_lib/routes.js';
import { systemRoutes } from './_routes/system.js';
import { tripRoutes } from './_routes/trips.js';
import { inviteRoutes } from './_routes/invites.js';
import { memberRoutes } from './_routes/members.js';

const table: RouteTable = {
  ...systemRoutes,
  ...tripRoutes,
  ...inviteRoutes,
  ...memberRoutes,
};

async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = (url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
  const handler = table[`${req.method} ${path}`];
  if (handler) return handler(req);

  const pathExists = Object.keys(table).some((k) => k.endsWith(` ${path}`));
  return pathExists
    ? json({ error: `${req.method} not allowed on /api/${path}` }, { status: 405 })
    : json({ error: `No API route /api/${path}` }, { status: 404 });
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
