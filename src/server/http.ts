import type { z } from 'zod';

export function fail(status: number, message: string): never {
  throw Response.json({ error: message }, { status });
}

// Browsers send Origin on state-changing requests, so a cross-site form or script is refused here
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : null;
  if (!origin || !expected || origin !== expected) {
    fail(403, 'This request came from an unexpected site');
  }
}

export async function readBody<Schema extends z.ZodType>(request: Request, schema: Schema) {
  assertSameOrigin(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    fail(400, 'The request could not be read');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    fail(400, parsed.error.issues[0]?.message ?? 'Please check the form and try again');
  }
  return parsed.data as z.output<Schema>;
}

// Hostinger's proxy appends the real client address as the last X-Forwarded-For entry
export function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',').pop()?.trim().slice(0, 64) || 'unknown';
}
