import { requireAdmin } from '@/server/auth';
import { getPool, type Row } from '@/server/db';

export async function GET(request: Request) {
  await requireAdmin(request);
  const db = getPool();

  const [people] = await db.query<Row[]>(
    `SELECT p.id, p.full_name AS fullName, p.birth_date AS birthDate, p.death_date AS deathDate,
       p.is_deceased = 1 AS isDeceased, p.facebook_url AS facebookUrl, a.email,
       creator.full_name AS addedBy
     FROM people p
     LEFT JOIN accounts a ON a.person_id = p.id
     LEFT JOIN people creator ON creator.id = p.created_by
     WHERE p.status = 'pending'
     ORDER BY p.created_at`
  );
  const [relations] = await db.query<Row[]>(
    `SELECT pending.id AS personId, 'spouse' AS relation, other.full_name AS relativeName
     FROM people pending
     JOIN spouses s ON pending.id IN (s.person_a_id, s.person_b_id)
     JOIN people other ON other.id = IF(s.person_a_id = pending.id, s.person_b_id, s.person_a_id)
     WHERE pending.status = 'pending'
     UNION ALL
     SELECT pending.id, 'child', other.full_name
     FROM people pending
     JOIN parent_child l ON l.child_id = pending.id
     JOIN people other ON other.id = l.parent_id
     WHERE pending.status = 'pending'
     UNION ALL
     SELECT pending.id, 'parent', other.full_name
     FROM people pending
     JOIN parent_child l ON l.parent_id = pending.id
     JOIN people other ON other.id = l.child_id
     WHERE pending.status = 'pending'`
  );

  return Response.json({
    approvals: people.map((person) => ({
      ...person,
      isDeceased: Boolean(person.isDeceased),
      relations: relations.filter((relation) => relation.personId === person.id),
    })),
  });
}
