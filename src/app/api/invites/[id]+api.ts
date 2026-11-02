import type { ResultSetHeader } from 'mysql2';

import { requireApproved } from '@/server/auth';
import { getPool } from '@/server/db';
import { assertSameOrigin, fail } from '@/server/http';

export async function DELETE(request: Request, { id }: Record<string, string>) {
  assertSameOrigin(request);
  const user = await requireApproved(request);
  const [result] = await getPool().execute<ResultSetHeader>(
    `UPDATE invites SET revoked_at = UTC_TIMESTAMP()
     WHERE id = ? AND claimed_at IS NULL AND revoked_at IS NULL AND (created_by = ? OR ? = 'admin')`,
    [id, user.personId, user.role]
  );
  if (result.affectedRows === 0) fail(404, 'That invite cannot be revoked');
  return Response.json({ ok: true });
}
