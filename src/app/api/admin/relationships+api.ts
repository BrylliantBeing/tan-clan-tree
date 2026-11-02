import { requireAdmin } from '@/server/auth';
import { type Row, withTransaction } from '@/server/db';
import { fail, readBody } from '@/server/http';
import { addParentLink, addSpouses, removeParentLink, removeSpouses } from '@/server/relations';
import { relationshipSchema } from '@/server/validation';

export async function POST(request: Request) {
  await requireAdmin(request);
  const { type, firstId, secondId, kind } = await readBody(request, relationshipSchema);

  await withTransaction(async (db) => {
    const [people] = await db.execute<Row[]>(
      `SELECT id FROM people WHERE id IN (?, ?) AND status = 'approved' FOR UPDATE`,
      [firstId, secondId]
    );
    if (people.length !== 2) fail(400, 'Both people must be in the family tree');
    if (type === 'spouse') {
      await addSpouses(db, firstId, secondId);
    } else {
      await addParentLink(db, firstId, secondId, kind);
    }
  });
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  await requireAdmin(request);
  const { type, firstId, secondId } = await readBody(request, relationshipSchema);

  await withTransaction(async (db) => {
    if (type === 'spouse') {
      await removeSpouses(db, firstId, secondId);
    } else {
      await removeParentLink(db, firstId, secondId);
    }
  });
  return Response.json({ ok: true });
}
