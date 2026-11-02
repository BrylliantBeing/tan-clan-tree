import { type ParentChildLink, wouldCreateCycle } from '@/features/tree/graph';

import { type Db, type Row } from './db';
import { fail } from './http';

export type RelationType = 'spouse' | 'child' | 'parent';

export type RelationRequest = {
  relationType: RelationType;
  relativeId: string;
  otherParentId: string | null;
};

const MAX_PARENTS = 2;

function orderedPair(first: string, second: string) {
  return first < second ? [first, second] : [second, first];
}

export async function addSpouses(db: Db, first: string, second: string) {
  await db.execute('INSERT IGNORE INTO spouses (person_a_id, person_b_id) VALUES (?, ?)', orderedPair(first, second));
}

export async function areSpouses(db: Db, first: string, second: string) {
  const [rows] = await db.execute<Row[]>(
    'SELECT 1 FROM spouses WHERE person_a_id = ? AND person_b_id = ?',
    orderedPair(first, second)
  );
  return rows.length > 0;
}

async function isApproved(db: Db, personId: string) {
  const [rows] = await db.execute<Row[]>(`SELECT 1 FROM people WHERE id = ? AND status = 'approved'`, [personId]);
  return rows.length > 0;
}

export async function parentCount(db: Db, childId: string) {
  const [rows] = await db.execute<Row[]>('SELECT COUNT(*) AS total FROM parent_child WHERE child_id = ?', [childId]);
  return Number(rows[0].total);
}

export async function assertRelationAllowed(db: Db, relation: RelationRequest) {
  const { relationType, relativeId, otherParentId } = relation;
  if (!(await isApproved(db, relativeId))) fail(400, 'That person is not in the family tree');

  if (relationType === 'child' && otherParentId) {
    if (otherParentId === relativeId) fail(400, 'Please choose a different second parent');
    if (!(await areSpouses(db, relativeId, otherParentId))) {
      fail(400, 'The second parent must be a spouse of the first parent');
    }
    if (!(await isApproved(db, otherParentId))) fail(400, 'That person is not in the family tree');
  }
  if (relationType !== 'child' && otherParentId) {
    fail(400, 'A second parent can only be chosen when adding a child');
  }
  if (relationType === 'parent' && (await parentCount(db, relativeId)) >= MAX_PARENTS) {
    fail(409, 'That person already has two parents in the family tree');
  }
}

// Only for a person who is being created, who cannot have descendants yet and so cannot form a cycle
export async function attachNewPerson(db: Db, personId: string, relation: RelationRequest) {
  const { relationType, relativeId, otherParentId } = relation;
  if (relationType === 'spouse') {
    await addSpouses(db, personId, relativeId);
  } else if (relationType === 'parent') {
    await db.execute('INSERT INTO parent_child (parent_id, child_id) VALUES (?, ?)', [personId, relativeId]);
  } else {
    await db.execute('INSERT INTO parent_child (parent_id, child_id) VALUES (?, ?)', [relativeId, personId]);
    if (otherParentId) {
      await db.execute('INSERT INTO parent_child (parent_id, child_id) VALUES (?, ?)', [otherParentId, personId]);
    }
  }
}

export async function addParentLink(db: Db, parentId: string, childId: string) {
  const [rows] = await db.execute<Row[]>('SELECT parent_id AS parentId, child_id AS childId FROM parent_child');
  if (wouldCreateCycle(rows as ParentChildLink[], parentId, childId)) {
    fail(409, 'This would make someone their own ancestor');
  }
  if ((await parentCount(db, childId)) >= MAX_PARENTS) {
    fail(409, 'That person already has two parents in the family tree');
  }
  await db.execute('INSERT IGNORE INTO parent_child (parent_id, child_id) VALUES (?, ?)', [parentId, childId]);
}

export async function removeAllRelations(db: Db, personId: string) {
  await db.execute('DELETE FROM spouses WHERE person_a_id = ? OR person_b_id = ?', [personId, personId]);
  await db.execute('DELETE FROM parent_child WHERE parent_id = ? OR child_id = ?', [personId, personId]);
}

export async function removeSpouses(db: Db, first: string, second: string) {
  await db.execute('DELETE FROM spouses WHERE person_a_id = ? AND person_b_id = ?', orderedPair(first, second));
}

export async function removeParentLink(db: Db, parentId: string, childId: string) {
  await db.execute('DELETE FROM parent_child WHERE parent_id = ? AND child_id = ?', [parentId, childId]);
}
