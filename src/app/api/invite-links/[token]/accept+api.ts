import { startSession } from '@/server/auth';
import { type Row, withTransaction } from '@/server/db';
import { fail, readBody } from '@/server/http';
import { hashPassword } from '@/server/password';
import { assertRelationAllowed, attachNewPerson } from '@/server/relations';
import { hashToken, newId } from '@/server/tokens';
import { acceptInviteSchema } from '@/server/validation';

export async function POST(request: Request, { token }: Record<string, string>) {
  const details = await readBody(request, acceptInviteSchema);
  const passwordHash = await hashPassword(details.password);

  const cookie = await withTransaction(async (db) => {
    // FOR UPDATE makes a second simultaneous claim wait, then see the link as already used
    const [invites] = await db.execute<Row[]>(
      `SELECT id, created_by AS createdBy, relation_type AS relationType,
         relative_id AS relativeId, other_parent_id AS otherParentId
       FROM invites
       WHERE token_hash = ? AND claim_person_id IS NULL
         AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
       FOR UPDATE`,
      [hashToken(token)]
    );
    const invite = invites[0];
    if (!invite) fail(404, 'This invite link has expired or was already used');

    const [existing] = await db.execute<Row[]>('SELECT 1 FROM accounts WHERE email = ?', [details.email]);
    if (existing.length > 0) fail(409, 'That email already has an account');

    const relation = {
      relationType: invite.relationType,
      relativeId: invite.relativeId,
      otherParentId: invite.otherParentId,
    };
    await assertRelationAllowed(db, relation);

    const personId = newId();
    const accountId = newId();
    await db.execute(
      `INSERT INTO people (id, full_name, birth_date, facebook_url, status, created_by)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [personId, details.fullName, details.birthDate, details.facebookUrl, invite.createdBy]
    );
    await db.execute('INSERT INTO accounts (id, person_id, email, password_hash) VALUES (?, ?, ?, ?)', [
      accountId,
      personId,
      details.email,
      passwordHash,
    ]);
    await attachNewPerson(db, personId, relation);
    await db.execute('UPDATE invites SET claimed_person_id = ?, claimed_at = UTC_TIMESTAMP() WHERE id = ?', [
      personId,
      invite.id,
    ]);
    return startSession(db, accountId);
  });

  return Response.json({ ok: true }, { status: 201, headers: { 'Set-Cookie': cookie } });
}
