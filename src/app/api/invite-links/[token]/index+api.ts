import { getPool, type Row } from '@/server/db';
import { fail } from '@/server/http';
import { hashToken } from '@/server/tokens';

// Public, because the invitee has no account yet. Reveals only the names the invite is about.
export async function GET(_request: Request, { token }: Record<string, string>) {
  const [rows] = await getPool().execute<Row[]>(
    `SELECT inviter.full_name AS inviterName, relative.full_name AS relativeName, i.relation_type AS relationType
     FROM invites i
     JOIN people inviter ON inviter.id = i.created_by
     JOIN people relative ON relative.id = i.relative_id
     WHERE i.token_hash = ? AND i.claimed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > UTC_TIMESTAMP()`,
    [hashToken(token)]
  );
  if (!rows[0]) fail(404, 'This invite link has expired or was already used');
  return Response.json({ invite: rows[0] });
}
