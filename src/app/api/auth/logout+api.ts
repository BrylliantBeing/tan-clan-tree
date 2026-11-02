import { clearedSessionCookie, endSession } from '@/server/auth';
import { assertSameOrigin } from '@/server/http';

export async function POST(request: Request) {
  assertSameOrigin(request);
  await endSession(request);
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearedSessionCookie() } });
}
