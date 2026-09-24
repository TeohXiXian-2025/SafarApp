// The ONE Vercel function behind every /api/* URL.
//
// Vercel's Hobby plan allows at most 12 functions per deployment, and Safar
// needs far more endpoints than that, so vercel.json rewrites
//   /api/<path>  →  /api/router?__path=<path>
// and api/_app.ts dispatches to handlers registered in api/_routes/*.
// Local dev does the same rewrite (scripts/vite-api-dev.ts).
//
// The app is loaded lazily so a startup failure (bad env, missing module)
// becomes a JSON 500 we can read, instead of an opaque FUNCTION_INVOCATION_FAILED.
type Dispatch = (req: Request) => Promise<Response>;
let app: Promise<Dispatch> | undefined;

async function handler(req: Request): Promise<Response> {
  try {
    app ??= import('./_app.js').then((m) => m.dispatch);
    return await (await app)(req);
  } catch (err) {
    app = undefined; // retry on next request
    console.error('[api] startup failed', err);
    const detail = process.env.VERCEL_ENV === 'production' ? undefined : String((err as Error)?.stack ?? err);
    return new Response(JSON.stringify({ error: 'API failed to start', detail }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
