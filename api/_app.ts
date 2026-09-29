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
import { demoRoutes } from './_routes/demo.js';
import { inBackground } from './_lib/background.js';
import { matesReact } from './_lib/demo.js';
import { isDemoTrip } from '../src/domain/index.js';

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
  ...demoRoutes,
};

export async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = (url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
  const handler = table[`${req.method} ${path}`];
  if (handler) {
    const res = await handler(req);
    // Demo trip: after the visitor does something on the Idea Board, the travel mates answer
    // (also after a failed request — e.g. a halal check that couldn't run still ends the wait).
    const tripId = url.searchParams.get('tripId');
    if (tripId && isDemoTrip(tripId) && path.startsWith('ideas/') && !req.headers.get('authorization')?.startsWith('Internal ')) {
      inBackground(`demo:${tripId}`, () => matesReact(tripId));
    }
    return res;
  }

  const pathExists = Object.keys(table).some((k) => k.endsWith(` ${path}`));
  return pathExists
    ? json({ error: `${req.method} not allowed on /api/${path}` }, { status: 405 })
    : json({ error: `No API route /api/${path}` }, { status: 404 });
}
