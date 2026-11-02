import { requireAdmin } from '@/server/auth';
import { type Row, withTransaction } from '@/server/db';
import { fail, readBody } from '@/server/http';
import { createToken, hashToken, newId } from '@/server/tokens';
import { createClaimInviteSchema } from '@/server/validation';

const INVITE_DAYS = 14;

// Admins only, because whoever opens this link signs in as that person with no further approval
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  const { personId } = await readBody(request, createClaimInviteSchema);
  const token = createToken();

  await withTransaction(async (db) => {
    const [people] = await db.execute<Row[]>(
      `SELECT p.is_deceased AS isDeceased, a.id AS accountId
       FROM people p
       LEFT JOIN accounts a ON a.person_id = p.id
       WHERE p.id = ? AND p.status = 'approved'
       FOR UPDATE`,
      [personId]
    );
    const person = people[0];
    if (!person) fail(404, 'That person is not in the family tree');
    if (person.isDeceased) fail(400, 'Deceased relatives cannot have a login');
    if (person.accountId) fail(409, 'That person already has a login');

    // Only the newest link works, so an older one that went astray can't be used
    await db.execute(
      `UPDATE invites SET revoked_at = UTC_TIMESTAMP()
       WHERE claim_person_id = ? AND claimed_at IS NULL AND revoked_at IS NULL`,
      [personId]
    );
    await db.execute(
      `INSERT INTO invites (id, token_hash, created_by, claim_person_id, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${INVITE_DAYS} DAY))`,
      [newId(), hashToken(token), admin.personId, personId]
    );
  });

  return Response.json({ url: `${process.env.APP_URL}/invite/${token}` }, { status: 201 });
}
