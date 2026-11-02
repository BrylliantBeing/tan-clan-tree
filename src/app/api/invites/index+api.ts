import { requireApproved } from '@/server/auth';
import { getPool, type Row } from '@/server/db';
import { readBody } from '@/server/http';
import { assertRelationAllowed } from '@/server/relations';
import { createToken, hashToken, newId } from '@/server/tokens';
import { createInviteSchema } from '@/server/validation';

const INVITE_DAYS = 14;

export async function GET(request: Request) {
  const user = await requireApproved(request);
  const [rows] = await getPool().execute<Row[]>(
    `SELECT i.id, i.relation_type AS relationType, relative.full_name AS relativeName,
       claimed.full_name AS claimedName, target.full_name AS claimName,
       i.expires_at AS expiresAt, i.created_at AS createdAt,
       CASE
         WHEN i.claimed_person_id IS NOT NULL THEN 'claimed'
         WHEN i.claimed_at IS NOT NULL THEN 'claimed'
         WHEN i.revoked_at IS NOT NULL THEN 'revoked'
         WHEN i.expires_at <= UTC_TIMESTAMP() THEN 'expired'
         ELSE 'active'
       END AS status
     FROM invites i
     LEFT JOIN people relative ON relative.id = i.relative_id
     LEFT JOIN people target ON target.id = i.claim_person_id
     LEFT JOIN people claimed ON claimed.id = i.claimed_person_id
     WHERE i.created_by = ?
     ORDER BY i.created_at DESC`,
    [user.personId]
  );
  return Response.json({ invites: rows });
}

export async function POST(request: Request) {
  const user = await requireApproved(request);
  const relation = await readBody(request, createInviteSchema);
  const db = getPool();
  await assertRelationAllowed(db, relation);

  const token = createToken();
  await db.execute(
    `INSERT INTO invites (id, token_hash, created_by, relation_type, relative_id, other_parent_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${INVITE_DAYS} DAY))`,
    [newId(), hashToken(token), user.personId, relation.relationType, relation.relativeId, relation.otherParentId]
  );
  // The token is only stored hashed, so this is the one time the link can be shown
  return Response.json({ url: `${process.env.APP_URL}/invite/${token}` }, { status: 201 });
}
