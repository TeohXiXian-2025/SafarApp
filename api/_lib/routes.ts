/** "METHOD path" (path without /api/ prefix) → handler. e.g. "POST trips/create" */
export type RouteTable = Record<string, (req: Request) => Promise<Response>>;
