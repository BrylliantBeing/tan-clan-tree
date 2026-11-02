/**
 * @jest-environment node
 */
import { DELETE } from '@/app/api/people/[id]+api';
import { getPool, withTransaction } from '@/server/db';

jest.mock('@/server/db', () => ({ getPool: jest.fn(), withTransaction: jest.fn() }));

const ADMIN = '3f2b1c9e-8a7d-4e6f-9b1a-2c3d4e5f6a7b';
const TARGET = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ORIGIN = 'https://family.example';

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

function remove(id = TARGET, origin = ORIGIN) {
  const request = new Request(`${ORIGIN}/api/people/${id}`, {
    method: 'DELETE',
    headers: { Origin: origin, Cookie: 'family_session=token' },
  });
  return DELETE(request, { id });
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

function deletion(db: ReturnType<typeof fakeDb>) {
  const call = db.execute.mock.calls.find(([sql]) => /DELETE FROM people/.test(sql));
  return call as unknown as [string, unknown[]] | undefined;
}

const inTree: [RegExp, unknown[]] = [/SELECT id FROM people/, [{ id: TARGET }]];

beforeAll(() => {
  process.env.APP_URL = ORIGIN;
});

beforeEach(() => {
  signInAs('admin');
});

describe('removing a person as an admin', () => {
  it('deletes them from the tree', async () => {
    const db = transactionOn(fakeDb([inTree]));
    expect(await statusOf(remove())).toBe(200);
    expect(deletion(db)![1]).toEqual([TARGET]);
  });

  it('refuses members, and removes nothing', async () => {
    signInAs('member');
    const db = transactionOn(fakeDb([inTree]));
    expect(await statusOf(remove())).toBe(403);
    expect(deletion(db)).toBeUndefined();
  });

  it('refuses requests from another site', async () => {
    const db = transactionOn(fakeDb([inTree]));
    expect(await statusOf(remove(TARGET, 'https://evil.example'))).toBe(403);
    expect(deletion(db)).toBeUndefined();
  });

  it('refuses an admin removing themselves', async () => {
    const db = transactionOn(fakeDb([[/SELECT id FROM people/, [{ id: ADMIN }]]]));
    expect(await statusOf(remove(ADMIN))).toBe(409);
    expect(deletion(db)).toBeUndefined();
  });

  it('refuses to remove the last admin', async () => {
    const db = transactionOn(fakeDb([inTree, [/FROM accounts/, [{ personId: TARGET }]]]));
    expect(await statusOf(remove())).toBe(409);
    expect(deletion(db)).toBeUndefined();
  });

  it('answers 404 for someone who is not in the tree', async () => {
    const db = transactionOn(fakeDb());
    expect(await statusOf(remove())).toBe(404);
    expect(deletion(db)).toBeUndefined();
  });

  it('refuses while an addition linked to them is waiting for review', async () => {
    const db = transactionOn(fakeDb([inTree, [/status = 'pending'/, [{ fullName: 'Maria Tan' }]]]));
    const failure = await remove().catch((thrown) => thrown as Response);
    expect(failure.status).toBe(409);
    expect((await failure.json()).error).toContain('Maria Tan');
    expect(deletion(db)).toBeUndefined();
  });
});
