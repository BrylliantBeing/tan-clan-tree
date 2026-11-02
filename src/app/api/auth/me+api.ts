import { getCurrentUser } from '@/server/auth';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ user: null });
  const { personId, fullName, email, role, status } = user;
  return Response.json({ user: { personId, fullName, email, role, status } });
}
