import { requireAdmin } from '@/server/auth';
import { withTransaction } from '@/server/db';
import { readBody } from '@/server/http';
import { assertRelationAllowed, attachNewPerson, resolveRelation } from '@/server/relations';
import { newId } from '@/server/tokens';
import { adminAddPersonSchema } from '@/server/validation';

// Adds someone straight to the tree, with no invite or review. They have no login until an admin creates a login link.
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  const { fullName, gender, birthDate, facebookUrl, phone, isDeceased, deathDate, ...proposed } = await readBody(
    request,
    adminAddPersonSchema
  );

  const id = await withTransaction(async (db) => {
    const relation = await resolveRelation(db, proposed);
    await assertRelationAllowed(db, relation);
    const personId = newId();
    await db.execute(
      `INSERT INTO people
         (id, full_name, gender, birth_date, is_deceased, death_date, facebook_url, phone, status, created_by, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, UTC_TIMESTAMP())`,
      [personId, fullName, gender, birthDate, isDeceased ? 1 : 0, deathDate, facebookUrl, phone, admin.personId, admin.personId]
    );
    await attachNewPerson(db, personId, relation);
    return personId;
  });

  return Response.json({ id }, { status: 201 });
}
