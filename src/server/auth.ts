import { type Db, getPool, type Row } from './db';
import { fail } from './http';
import { createToken, hashToken } from './tokens';

const COOKIE_NAME = 'family_session';
const SESSION_DAYS = 30;

export type CurrentUser = {
  accountId: string;
  personId: string;
  fullName: string;
  email: string;
  role: 'member' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
};

function cookieAttributes() {
  const secure = process.env.APP_URL?.startsWith('https://') ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export async function startSession(db: Db, accountId: string) {
  const token = createToken();
  await db.execute(
    `INSERT INTO sessions (token_hash, account_id, expires_at)
     VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${SESSION_DAYS} DAY))`,
    [hashToken(token), accountId]
  );
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; ${cookieAttributes()}`;
}

export function clearedSessionCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; ${cookieAttributes()}`;
}

function sessionToken(request: Request) {
  const cookies = request.headers.get('cookie') ?? '';
  for (const cookie of cookies.split(';')) {
    const [name, value] = cookie.trim().split('=');
    if (name === COOKIE_NAME && value) return value;
  }
  return null;
}

export async function endSession(request: Request) {
  const token = sessionToken(request);
  if (token) {
    await getPool().execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
  }
}

export async function endAllSessions(db: Db, accountId: string) {
  await db.execute('DELETE FROM sessions WHERE account_id = ?', [accountId]);
}

export async function getCurrentUser(request: Request): Promise<CurrentUser | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const [rows] = await getPool().execute<Row[]>(
    `SELECT a.id AS accountId, p.id AS personId, p.full_name AS fullName, a.email, a.role, p.status
     FROM sessions s
     JOIN accounts a ON a.id = s.account_id
     JOIN people p ON p.id = a.person_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND a.disabled_at IS NULL`,
    [hashToken(token)]
  );
  return (rows[0] as CurrentUser | undefined) ?? null;
}

export async function requireSession(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) fail(401, 'Please sign in');
  return user;
}

export async function requireApproved(request: Request) {
  const user = await requireSession(request);
  if (user.status !== 'approved') fail(403, 'Your account is waiting for approval');
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireApproved(request);
  if (user.role !== 'admin') fail(403, 'Only admins can do this');
  return user;
}
