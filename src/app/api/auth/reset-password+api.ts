import { endAllSessions } from '@/server/auth';
import { type Row, withTransaction } from '@/server/db';
import { fail, readBody } from '@/server/http';
import { hashPassword } from '@/server/password';
import { hashToken } from '@/server/tokens';
import { resetPasswordSchema } from '@/server/validation';

export async function POST(request: Request) {
  const { token, password } = await readBody(request, resetPasswordSchema);
  const passwordHash = await hashPassword(password);
  const tokenHash = hashToken(token);

  await withTransaction(async (db) => {
    const [rows] = await db.execute<Row[]>(
      `SELECT r.account_id AS accountId, a.email
       FROM password_resets r
       JOIN accounts a ON a.id = r.account_id
       WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > UTC_TIMESTAMP() AND a.disabled_at IS NULL
       FOR UPDATE`,
      [tokenHash]
    );
    const reset = rows[0];
    if (!reset) fail(400, 'This reset link has expired or was already used');

    await db.execute('UPDATE accounts SET password_hash = ? WHERE id = ?', [passwordHash, reset.accountId]);
    await db.execute('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE token_hash = ?', [tokenHash]);
    await db.execute('DELETE FROM login_attempts WHERE email = ?', [reset.email]);
    await endAllSessions(db, reset.accountId);
  });

  return Response.json({ ok: true });
}
