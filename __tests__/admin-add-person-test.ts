/**
 * @jest-environment node
 */
import { POST } from '@/app/api/admin/people+api';
import { getPool, withTransaction } from '@/server/db';

jest.mock('@/server/db', () => ({ getPool: jest.fn(), withTransaction: jest.fn() }));

const ADMIN = '3f2b1c9e-8a7d-4e6f-9b1a-2c3d4e5f6a7b';
const RELATIVE = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ORIGIN = 'https://family.example';

const details = {
  relationType: 'child',
  relativeId: RELATIVE,
  otherParentId: null,
  fullName: 'Maria Tan',
  birthDate: '1980-02-29',
  facebookUrl: '',
  phone: '+63 917 123 4567',
  isDeceased: false,
  deathDate: '',
};

// Answers each query with the rows of the first pattern it matches
function fakeDb(answers: [RegExp, unknown[]][] = []) {
  return {
    execute: jest.fn(async (sql: string) => {
      const match = answers.find(([pattern]) => pattern.test(sql));
      return [match ? match[1] : []];
    }),
  };
}

function signInAs(role: 'member' | 'admin') {
  const session = fakeDb([[/FROM sessions/, [{ personId: ADMIN, role, status: 'approved' }]]]);
  jest.mocked(getPool).mockReturnValue(session as never);
}

function transactionOn(db: ReturnType<typeof fakeDb>) {
  jest.mocked(withTransaction).mockImplementation(((work: (db: unknown) => unknown) => work(db)) as never);
  return db;
}

function post(body: unknown, origin = ORIGIN) {
  return new Request(`${ORIGIN}/api/admin/people`, {
    method: 'POST',
    headers: { Origin: origin, Cookie: 'family_session=token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function statusOf(work: Promise<Response>) {
  try {
    return (await work).status;
  } catch (thrown) {
    // The server's fail() throws a Response
    if (thrown instanceof Response) return thrown.status;
    throw thrown;
  }
}

function insertedPerson(db: ReturnType<typeof fakeDb>) {
  const call = db.execute.mock.calls.find(([sql]) => /INSERT INTO people/.test(sql));
  return call as unknown as [string, unknown[]] | undefined;
}

const inTree: [RegExp, unknown[]] = [/SELECT 1 FROM people/, [{ 1: 1 }]];

beforeAll(() => {
  process.env.APP_URL = ORIGIN;
});

beforeEach(() => {
  signInAs('admin');
});

describe('adding a person as an admin', () => {
  it('puts them straight in the tree, marked as reviewed by the admin', async () => {
    const db = transactionOn(fakeDb([inTree]));
    expect(await statusOf(POST(post(details)))).toBe(201);

    const [sql, params] = insertedPerson(db)!;
    expect(sql).toContain(`'approved'`);
    expect(params.slice(1)).toEqual(['Maria Tan', '1980-02-29', 0, null, null, '+63 917 123 4567', ADMIN, ADMIN]);
  });

  it('links them to their relative in the same transaction', async () => {
    const db = transactionOn(fakeDb([inTree]));
    const response = await POST(post(details));
    const { id } = await response.json();
    const link = db.execute.mock.calls.find(([sql]) => /INSERT INTO parent_child/.test(sql)) as unknown as [string, unknown[]];
    expect(link[1]).toEqual([RELATIVE, id]);
  });

  it('never creates a login', async () => {
    const db = transactionOn(fakeDb([inTree]));
    await POST(post(details));
    expect(db.execute.mock.calls.some(([sql]) => /accounts/.test(sql))).toBe(false);
  });

  it('saves a deceased relative with their date of death', async () => {
    const db = transactionOn(fakeDb([inTree]));
    const deceased = { ...details, phone: '', isDeceased: true, deathDate: '2010-01-01' };
    expect(await statusOf(POST(post(deceased)))).toBe(201);
    const [, params] = insertedPerson(db)!;
    expect(params.slice(3, 5)).toEqual([1, '2010-01-01']);
  });

  it('refuses members, and adds nothing', async () => {
    signInAs('member');
    const db = transactionOn(fakeDb([inTree]));
    expect(await statusOf(POST(post(details)))).toBe(403);
    expect(insertedPerson(db)).toBeUndefined();
  });

  it('refuses requests from another site', async () => {
    const db = transactionOn(fakeDb([inTree]));
    expect(await statusOf(POST(post(details, 'https://evil.example')))).toBe(403);
    expect(insertedPerson(db)).toBeUndefined();
  });

  it('refuses a death date on someone who is living, or one before their birth', async () => {
    const db = transactionOn(fakeDb([inTree]));
    expect(await statusOf(POST(post({ ...details, deathDate: '2010-01-01' })))).toBe(400);
    expect(await statusOf(POST(post({ ...details, isDeceased: true, deathDate: '1970-01-01' })))).toBe(400);
    expect(insertedPerson(db)).toBeUndefined();
  });

  it('applies the same relationship rules as everyone else', async () => {
    const full = transactionOn(fakeDb([inTree, [/COUNT\(\*\)/, [{ total: 2 }]]]));
    expect(await statusOf(POST(post({ ...details, relationType: 'parent' })))).toBe(409);
    expect(insertedPerson(full)).toBeUndefined();

    const notInTree = transactionOn(fakeDb());
    expect(await statusOf(POST(post(details)))).toBe(400);
    expect(insertedPerson(notInTree)).toBeUndefined();
  });

  it('saves a sibling as another child of the same parents', async () => {
    const db = transactionOn(fakeDb([inTree, [/FROM parent_child l/, [{ parentId: 'mom' }]]]));
    const response = await POST(post({ ...details, relationType: 'sibling' }));
    const { id } = await response.json();
    const link = db.execute.mock.calls.find(([sql]) => /INSERT INTO parent_child/.test(sql)) as unknown as [string, unknown[]];
    expect(link[1]).toEqual(['mom', id]);
  });
});
