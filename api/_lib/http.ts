import { z, ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...init.headers },
  });
}

/** Parses and validates a JSON body; throws 400 with Zod issues on failure. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
  return schema.parse(body);
}

type Handler = (req: Request) => Promise<Response>;

/** Wraps a route: converts thrown errors into JSON responses. */
export function handle(fn: Handler): Handler {
  return async (req) => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return json({ error: 'Invalid input', details: err.issues }, { status: 400 });
      }
      console.error('[api] unhandled error', err);
      return json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
