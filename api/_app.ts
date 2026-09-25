// Route table + dispatcher for the single /api function (see api/router.ts).
import { json } from './_lib/http.js';
import type { RouteTable } from './_lib/routes.js';
import { systemRoutes } from './_routes/system.js';
import { tripRoutes } from './_routes/trips.js';
import { inviteRoutes } from './_routes/invites.js';
import { memberRoutes } from './_routes/members.js';
import { bookingRoutes } from './_routes/bookings.js';
import { ideaRoutes } from './_routes/ideas.js';
import { scheduleRoutes } from './_routes/schedule.js';
import { decisionRoutes } from './_routes/decisions.js';
import { notificationRoutes } from './_routes/notifications.js';
import { foodRoutes } from './_routes/food.js';
import { expenseRoutes } from './_routes/expenses.js';
import { stayRoutes } from './_routes/stays.js';
import { vaultRoutes } from './_routes/vault.js';
import { resyncRoutes } from './_routes/resync.js';

const table: RouteTable = {
  ...systemRoutes,
  ...tripRoutes,
  ...inviteRoutes,
  ...memberRoutes,
  ...bookingRoutes,
  ...ideaRoutes,
  ...scheduleRoutes,
  ...decisionRoutes,
  ...notificationRoutes,
  ...foodRoutes,
  ...expenseRoutes,
  ...stayRoutes,
  ...vaultRoutes,
  ...resyncRoutes,
};

export async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = (url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
  const handler = table[`${req.method} ${path}`];
  if (handler) return handler(req);

  const pathExists = Object.keys(table).some((k) => k.endsWith(` ${path}`));
  return pathExists
    ? json({ error: `${req.method} not allowed on /api/${path}` }, { status: 405 })
    : json({ error: `No API route /api/${path}` }, { status: 404 });
}
