import { type CurrentUser, requireApproved } from '@/server/auth';
import { getPool, type Row } from '@/server/db';
import { assertSameOrigin, fail, readBody } from '@/server/http';
import { detectPhotoType, MAX_PHOTO_BYTES } from '@/server/photos';
import { photoSchema } from '@/server/validation';

function assertCanEdit(user: CurrentUser, id: string) {
  if (user.role !== 'admin' && id !== user.personId) fail(403, 'You can only change your own photo');
}

export async function GET(request: Request, { id }: Record<string, string>) {
  await requireApproved(request);
  const [rows] = await getPool().execute<Row[]>(
    `SELECT ph.content_type AS contentType, ph.data
     FROM person_photos ph
     JOIN people p ON p.id = ph.person_id AND p.status = 'approved'
     WHERE ph.person_id = ?`,
    [id]
  );
  const photo = rows[0];
  if (!photo) fail(404, 'No photo');

  return new Response(new Uint8Array(photo.data), {
    headers: {
      'Content-Type': photo.contentType,
      'X-Content-Type-Options': 'nosniff',
      // Links carry a version that changes with each upload, so a cached copy is never out of date
      'Cache-Control': 'private, max-age=604800, immutable',
    },
  });
}

export async function PUT(request: Request, { id }: Record<string, string>) {
  const user = await requireApproved(request);
  assertCanEdit(user, id);

  // Base64 is about a third larger than the image it holds
  if (Number(request.headers.get('content-length') ?? 0) > MAX_PHOTO_BYTES * 2) fail(413, 'That photo is too large');
  const { data } = await readBody(request, photoSchema);

  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) fail(413, 'That photo is too large');
  const contentType = detectPhotoType(bytes);
  if (!contentType) fail(400, 'Please choose a JPEG, PNG or WebP picture');

  const db = getPool();
  const [people] = await db.execute<Row[]>(`SELECT 1 FROM people WHERE id = ? AND status = 'approved'`, [id]);
  if (people.length === 0) fail(404, 'That person is not in the family tree');

  await db.execute(
    `INSERT INTO person_photos (person_id, content_type, data, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE content_type = VALUES(content_type), data = VALUES(data), updated_at = VALUES(updated_at)`,
    [id, contentType, bytes]
  );
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { id }: Record<string, string>) {
  assertSameOrigin(request);
  const user = await requireApproved(request);
  assertCanEdit(user, id);
  await getPool().execute('DELETE FROM person_photos WHERE person_id = ?', [id]);
  return Response.json({ ok: true });
}
