// Dev-only: serves the /api Vercel function from the Vite dev server, so
// `npm run dev` runs frontend + backend together on one port.
// Production uses Vercel's own function runtime; this file is not deployed.
//
// Mirrors the vercel.json rewrite: every /api/<path> is handled by
// api/router.ts with ?__path=<path>. The router exports Web-signature
// handlers: `export const GET = (req: Request) => Response`.
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin, type ViteDevServer } from 'vite';

async function toRequest(req: IncomingMessage, url: URL): Promise<Request> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, v);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error — required by Node's fetch when streaming a body
    duplex: hasBody ? 'half' : undefined,
  });
}

async function sendResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  if (response.body) {
    Readable.fromWeb(response.body as any).pipe(res);
  } else {
    res.end();
  }
}

export function vercelApiDev(): Plugin {
  return {
    name: 'safar-vercel-api-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // Expose ALL .env/.env.local vars (not only VITE_*) to the api handlers,
      // like Vercel does for functions. Real process env wins.
      const env = loadEnv(server.config.mode, server.config.root, '');
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

      const routerFile = path.resolve(server.config.root, 'api/router.ts');

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/') && req.url !== '/api') return next();
        const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
        try {
          url.searchParams.set('__path', url.pathname.replace(/^\/api\/?/, ''));
          const mod = await server.ssrLoadModule(routerFile);
          const handler = mod[req.method ?? 'GET'];
          if (typeof handler !== 'function') {
            res.statusCode = 405;
            res.setHeader('content-type', 'application/json');
            return res.end(JSON.stringify({ error: `${req.method} not allowed` }));
          }
          const response: Response = await handler(await toRequest(req, url));
          await sendResponse(res, response);
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error('[api dev]', err);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal server error (see terminal)' }));
        }
      });
    },
  };
}
