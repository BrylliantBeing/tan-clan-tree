import { requireApproved } from '@/server/auth';
import { withTransaction } from '@/server/db';
import { readBody } from '@/server/http';
import { assertRelationAllowed, attachNewPerson } from '@/server/relations';
import { newId } from '@/server/tokens';
import { proposeDeceasedSchema } from '@/server/validation';

// Proposes a deceased relative. They have no login, and admins manage the profile once approved.
export async function POST(request: Request) {
  const user = await requireApproved(request);
  const { fullName, birthDate, deathDate, facebookUrl, ...relation } = await readBody(request, proposeDeceasedSchema);

  const id = await withTransaction(async (db) => {
    await assertRelationAllowed(db, relation);
    const personId = newId();
    await db.execute(
      `INSERT INTO people (id, full_name, birth_date, is_deceased, death_date, facebook_url, status, created_by)
       VALUES (?, ?, ?, 1, ?, ?, 'pending', ?)`,
      [personId, fullName, birthDate, deathDate, facebookUrl, user.personId]
    );
    await attachNewPerson(db, personId, relation);
    return personId;
  });

  return Response.json({ id }, { status: 201 });
}
