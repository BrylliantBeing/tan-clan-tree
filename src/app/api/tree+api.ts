import { requireApproved } from '@/server/auth';
import { getPool, type Row } from '@/server/db';

export async function GET(request: Request) {
  await requireApproved(request);
  const db = getPool();

  const [people] = await db.query<Row[]>(
    `SELECT p.id, p.full_name AS fullName, p.birth_date AS birthDate, p.death_date AS deathDate,
       p.is_deceased = 1 AS isDeceased, p.facebook_url AS facebookUrl, p.phone,
       UNIX_TIMESTAMP(ph.updated_at) AS photoVersion,
       a.id IS NOT NULL AS hasAccount, COALESCE(a.role, 'member') AS role
     FROM people p
     LEFT JOIN accounts a ON a.person_id = p.id
     LEFT JOIN person_photos ph ON ph.person_id = p.id
     WHERE p.status = 'approved'
     ORDER BY p.full_name`
  );
  const [spouses] = await db.query<Row[]>(
    `SELECT s.person_a_id AS firstId, s.person_b_id AS secondId
     FROM spouses s
     JOIN people a ON a.id = s.person_a_id AND a.status = 'approved'
     JOIN people b ON b.id = s.person_b_id AND b.status = 'approved'`
  );
  const [parentChild] = await db.query<Row[]>(
    `SELECT l.parent_id AS parentId, l.child_id AS childId, l.kind
     FROM parent_child l
     JOIN people parent ON parent.id = l.parent_id AND parent.status = 'approved'
     JOIN people child ON child.id = l.child_id AND child.status = 'approved'`
  );

  return Response.json({
    people: people.map((person) => ({
      ...person,
      isDeceased: Boolean(person.isDeceased),
      hasAccount: Boolean(person.hasAccount),
    })),
    spouses,
    parentChild,
  });
}
