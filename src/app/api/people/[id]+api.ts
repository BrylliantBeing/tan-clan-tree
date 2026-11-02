import { assertNotLastAdmin } from '@/server/admins';
import { endAllSessions, requireApproved } from '@/server/auth';
import { getPool, type Row, withTransaction } from '@/server/db';
import { fail, readBody } from '@/server/http';
import { adminUpdatePersonSchema, updateSelfSchema } from '@/server/validation';

export async function PATCH(request: Request, { id }: Record<string, string>) {
  const user = await requireApproved(request);

  if (user.role !== 'admin') {
    if (id !== user.personId) fail(403, 'You can only edit your own details');
    const { fullName, birthDate, facebookUrl, phone } = await readBody(request, updateSelfSchema);
    await getPool().execute('UPDATE people SET full_name = ?, birth_date = ?, facebook_url = ?, phone = ? WHERE id = ?', [
      fullName,
      birthDate,
      facebookUrl,
      phone,
      id,
    ]);
    return Response.json({ ok: true });
  }

  const { fullName, birthDate, facebookUrl, phone, isDeceased, deathDate } = await readBody(
    request,
    adminUpdatePersonSchema
  );

  await withTransaction(async (db) => {
    const [people] = await db.execute<Row[]>(
      `SELECT p.is_deceased AS wasDeceased, a.id AS accountId
       FROM people p
       LEFT JOIN accounts a ON a.person_id = p.id
       WHERE p.id = ? AND p.status = 'approved'
       FOR UPDATE`,
      [id]
    );
    const person = people[0];
    if (!person) fail(404, 'That person is not in the family tree');

    if (isDeceased && !person.wasDeceased) {
      await assertNotLastAdmin(db, id);
      if (person.accountId) {
        await db.execute('UPDATE accounts SET disabled_at = UTC_TIMESTAMP() WHERE id = ?', [person.accountId]);
        await endAllSessions(db, person.accountId);
      }
      await db.execute(
        `UPDATE invites SET revoked_at = UTC_TIMESTAMP()
         WHERE (created_by = ? OR claim_person_id = ?) AND claimed_at IS NULL AND revoked_at IS NULL`,
        [id, id]
      );
    }
    // Lets an admin undo marking someone as deceased by mistake
    if (!isDeceased && person.wasDeceased && person.accountId) {
      await db.execute('UPDATE accounts SET disabled_at = NULL WHERE id = ?', [person.accountId]);
    }

    await db.execute(
      `UPDATE people SET full_name = ?, birth_date = ?, facebook_url = ?, phone = ?, is_deceased = ?, death_date = ?
       WHERE id = ?`,
      [fullName, birthDate, facebookUrl, phone, isDeceased ? 1 : 0, deathDate, id]
    );
  });

  return Response.json({ ok: true });
}
