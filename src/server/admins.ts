import { type Db, type Row } from './db';
import { fail } from './http';

// Call inside a transaction. FOR UPDATE stops two admins from removing each other at the same moment.
export async function assertNotLastAdmin(db: Db, personId: string) {
  const [admins] = await db.execute<Row[]>(
    `SELECT a.person_id AS personId
     FROM accounts a
     JOIN people p ON p.id = a.person_id
     WHERE a.role = 'admin' AND a.disabled_at IS NULL AND p.status = 'approved'
     FOR UPDATE`
  );
  const isAdmin = admins.some((admin) => admin.personId === personId);
  if (isAdmin && admins.length <= 1) fail(409, 'The family tree needs at least one admin');
}
