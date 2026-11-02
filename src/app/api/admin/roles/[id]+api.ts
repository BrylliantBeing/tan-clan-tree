import { assertNotLastAdmin } from '@/server/admins';
import { requireAdmin } from '@/server/auth';
import { type Row, withTransaction } from '@/server/db';
import { fail, readBody } from '@/server/http';
import { roleSchema } from '@/server/validation';

export async function PUT(request: Request, { id }: Record<string, string>) {
  await requireAdmin(request);
  const { role } = await readBody(request, roleSchema);

  await withTransaction(async (db) => {
    const [accounts] = await db.execute<Row[]>(
      `SELECT a.id
       FROM accounts a
       JOIN people p ON p.id = a.person_id
       WHERE a.person_id = ? AND a.disabled_at IS NULL AND p.status = 'approved'`,
      [id]
    );
    if (!accounts[0]) fail(404, 'That person does not have an active account');
    if (role === 'member') await assertNotLastAdmin(db, id);
    await db.execute('UPDATE accounts SET role = ? WHERE id = ?', [role, accounts[0].id]);
  });
  return Response.json({ ok: true });
}
