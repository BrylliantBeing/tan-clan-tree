import { assertNotLastAdmin } from '@/server/admins';
import { endAllSessions, requireAdmin, requireApproved } from '@/server/auth';
import { getPool, type Row, withTransaction } from '@/server/db';
import { assertSameOrigin, fail, readBody } from '@/server/http';
import { adminUpdatePersonSchema, updateSelfSchema } from '@/server/validation';

export async function PATCH(request: Request, { id }: Record<string, string>) {
  const user = await requireApproved(request);

  if (user.role !== 'admin') {
    if (id !== user.personId) fail(403, 'You can only edit your own details');
    const { fullName, gender, birthDate, facebookUrl, phone } = await readBody(request, updateSelfSchema);
    await getPool().execute(
      'UPDATE people SET full_name = ?, gender = ?, birth_date = ?, facebook_url = ?, phone = ? WHERE id = ?',
      [fullName, gender, birthDate, facebookUrl, phone, id]
    );
    return Response.json({ ok: true });
  }

  const { fullName, gender, birthDate, facebookUrl, phone, isDeceased, deathDate } = await readBody(
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
      `UPDATE people SET full_name = ?, gender = ?, birth_date = ?, facebook_url = ?, phone = ?, is_deceased = ?, death_date = ?
       WHERE id = ?`,
      [fullName, gender, birthDate, facebookUrl, phone, isDeceased ? 1 : 0, deathDate, id]
    );
  });

  return Response.json({ ok: true });
}

// Removes someone for good. The foreign keys take their login, sessions, photo, relationships and invites with them.
export async function DELETE(request: Request, { id }: Record<string, string>) {
  assertSameOrigin(request);
  const admin = await requireAdmin(request);
  if (id === admin.personId) fail(409, 'You cannot remove yourself. Ask another admin to do it.');

  await withTransaction(async (db) => {
    await assertNotLastAdmin(db, id);
    const [people] = await db.execute<Row[]>(`SELECT id FROM people WHERE id = ? AND status = 'approved' FOR UPDATE`, [
      id,
    ]);
    if (!people[0]) fail(404, 'That person is not in the family tree');

    // Their link to this person would vanish, and approving them later would leave them attached to no one
    const [waiting] = await db.execute<Row[]>(
      `SELECT full_name AS fullName FROM people
       WHERE status = 'pending' AND id IN (
         SELECT child_id FROM parent_child WHERE parent_id = ?
         UNION SELECT parent_id FROM parent_child WHERE child_id = ?
         UNION SELECT person_a_id FROM spouses WHERE person_b_id = ?
         UNION SELECT person_b_id FROM spouses WHERE person_a_id = ?
       )
       LIMIT 1`,
      [id, id, id, id]
    );
    if (waiting[0]) {
      fail(409, `${waiting[0].fullName} is waiting for approval and is linked to this person. Approve or reject them first.`);
    }

    await db.execute('DELETE FROM people WHERE id = ?', [id]);
  });

  return Response.json({ ok: true });
}
