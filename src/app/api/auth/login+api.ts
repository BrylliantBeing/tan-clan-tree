import { startSession } from '@/server/auth';
import { getPool, type Row } from '@/server/db';
import { clientIp, fail, readBody } from '@/server/http';
import { hashPassword, verifyPassword } from '@/server/password';
import { loginSchema } from '@/server/validation';

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 30;

let decoyHash: Promise<string> | undefined;

export async function POST(request: Request) {
  const { email, password } = await readBody(request, loginSchema);
  const ip = clientIp(request);
  const db = getPool();

  const [attempts] = await db.execute<Row[]>(
    `SELECT
       COALESCE(SUM(email = ?), 0) AS byEmail,
       COALESCE(SUM(ip = ?), 0) AS byIp
     FROM login_attempts
     WHERE (email = ? OR ip = ?) AND attempted_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${WINDOW_MINUTES} MINUTE)`,
    [email, ip, email, ip]
  );
  if (Number(attempts[0].byEmail) >= MAX_FAILURES_PER_EMAIL || Number(attempts[0].byIp) >= MAX_FAILURES_PER_IP) {
    fail(429, 'Too many failed attempts. Please wait 15 minutes and try again.');
  }

  const [accounts] = await db.execute<Row[]>(
    'SELECT id, password_hash AS passwordHash FROM accounts WHERE email = ? AND disabled_at IS NULL',
    [email]
  );
  const account = accounts[0];

  // Check a decoy hash when the account is missing so response timing does not reveal which emails exist
  decoyHash ??= hashPassword(crypto.randomUUID());
  const matches = await verifyPassword(password, account?.passwordHash ?? (await decoyHash));

  if (!account || !matches) {
    await db.execute('INSERT INTO login_attempts (email, ip, attempted_at) VALUES (?, ?, UTC_TIMESTAMP())', [email, ip]);
    await db.execute('DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)');
    fail(401, 'That email and password do not match');
  }

  await db.execute('DELETE FROM login_attempts WHERE email = ?', [email]);
  const cookie = await startSession(db, account.id);
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie } });
}
