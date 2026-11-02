import { getPool, type Row } from '@/server/db';
import { readBody } from '@/server/http';
import { sendPasswordResetEmail } from '@/server/mail';
import { createToken, hashToken } from '@/server/tokens';
import { forgotPasswordSchema } from '@/server/validation';

const MAX_ACTIVE_LINKS = 3;

export async function POST(request: Request) {
  const { email } = await readBody(request, forgotPasswordSchema);
  const db = getPool();

  const [accounts] = await db.execute<Row[]>(
    `SELECT a.id,
       (SELECT COUNT(*) FROM password_resets r
        WHERE r.account_id = a.id AND r.expires_at > UTC_TIMESTAMP()) AS activeLinks
     FROM accounts a
     WHERE a.email = ? AND a.disabled_at IS NULL`,
    [email]
  );
  const account = accounts[0];

  if (account && Number(account.activeLinks) < MAX_ACTIVE_LINKS) {
    const token = createToken();
    await db.execute(
      `INSERT INTO password_resets (token_hash, account_id, expires_at)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))`,
      [hashToken(token), account.id]
    );
    // Not awaited, so response timing does not reveal whether the email exists
    sendPasswordResetEmail(email, `${process.env.APP_URL}/reset-password/${token}`).catch((error) => {
      console.error('Could not send password reset email', error);
    });
  }

  return Response.json({ ok: true });
}
