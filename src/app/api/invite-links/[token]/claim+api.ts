import { startSession } from '@/server/auth';
import { type Row, withTransaction } from '@/server/db';
import { fail, readBody } from '@/server/http';
import { hashPassword } from '@/server/password';
import { hashToken, newId } from '@/server/tokens';
import { claimProfileSchema } from '@/server/validation';

export async function POST(request: Request, { token }: Record<string, string>) {
  const { facebookUrl, email, password } = await readBody(request, claimProfileSchema);
  const passwordHash = await hashPassword(password);

  const cookie = await withTransaction(async (db) => {
    // FOR UPDATE makes a second simultaneous claim wait, then see the link as already used
    const [invites] = await db.execute<Row[]>(
      `SELECT id, claim_person_id AS personId
       FROM invites
       WHERE token_hash = ? AND claim_person_id IS NOT NULL
         AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
       FOR UPDATE`,
      [hashToken(token)]
    );
    const invite = invites[0];
    if (!invite) fail(404, 'This invite link has expired or was already used');

    const [people] = await db.execute<Row[]>(
      `SELECT p.id, a.id AS accountId
       FROM people p
       LEFT JOIN accounts a ON a.person_id = p.id
       WHERE p.id = ? AND p.status = 'approved' AND p.is_deceased = 0
       FOR UPDATE`,
      [invite.personId]
    );
    if (!people[0] || people[0].accountId) fail(404, 'This invite link has expired or was already used');

    const [existing] = await db.execute<Row[]>('SELECT 1 FROM accounts WHERE email = ?', [email]);
    if (existing.length > 0) fail(409, 'That email already has an account');

    const accountId = newId();
    await db.execute('INSERT INTO accounts (id, person_id, email, password_hash) VALUES (?, ?, ?, ?)', [
      accountId,
      invite.personId,
      email,
      passwordHash,
    ]);
    if (facebookUrl) {
      await db.execute('UPDATE people SET facebook_url = ? WHERE id = ?', [facebookUrl, invite.personId]);
    }
    await db.execute('UPDATE invites SET claimed_person_id = ?, claimed_at = UTC_TIMESTAMP() WHERE id = ?', [
      invite.personId,
      invite.id,
    ]);
    return startSession(db, accountId);
  });

  return Response.json({ ok: true }, { status: 201, headers: { 'Set-Cookie': cookie } });
}
