import { endAllSessions, requireAdmin } from '@/server/auth';
import { type Db, type Row, withTransaction } from '@/server/db';
import { assertSameOrigin, fail } from '@/server/http';
import { removeAllRelations } from '@/server/relations';

async function lockPending(db: Db, id: string) {
  const [people] = await db.execute<Row[]>(
    `SELECT a.id AS accountId
     FROM people p
     LEFT JOIN accounts a ON a.person_id = p.id
     WHERE p.id = ? AND p.status = 'pending'
     FOR UPDATE`,
    [id]
  );
  if (!people[0]) fail(409, 'This addition was already reviewed');
  return people[0];
}

// Approves the person
export async function POST(request: Request, { id }: Record<string, string>) {
  assertSameOrigin(request);
  const admin = await requireAdmin(request);

  await withTransaction(async (db) => {
    await lockPending(db, id);
    await db.execute(
      `UPDATE people SET status = 'approved', reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?`,
      [admin.personId, id]
    );
  });
  return Response.json({ ok: true });
}

// Rejects the person
export async function DELETE(request: Request, { id }: Record<string, string>) {
  assertSameOrigin(request);
  const admin = await requireAdmin(request);

  await withTransaction(async (db) => {
    const { accountId } = await lockPending(db, id);
    await removeAllRelations(db, id);
    if (accountId) {
      await db.execute('UPDATE accounts SET disabled_at = UTC_TIMESTAMP() WHERE id = ?', [accountId]);
      await endAllSessions(db, accountId);
    }
    await db.execute(
      `UPDATE people SET status = 'rejected', reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?`,
      [admin.personId, id]
    );
  });
  return Response.json({ ok: true });
}
