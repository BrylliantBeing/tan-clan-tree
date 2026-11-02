/**
 * @jest-environment node
 */
import { DELETE, GET, PUT } from '@/app/api/people/[id]/photo+api';
import { requireApproved } from '@/server/auth';
import { getPool } from '@/server/db';
import { addParentLink, assertRelationAllowed, resolveRelation } from '@/server/relations';

jest.mock('@/server/auth', () => ({ requireApproved: jest.fn() }));
jest.mock('@/server/db', () => ({ getPool: jest.fn() }));

const SELF = '3f2b1c9e-8a7d-4e6f-9b1a-2c3d4e5f6a7b';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ORIGIN = 'https://family.example';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

// Answers each query with the rows of the first pattern it matches
function fakeDb(answers: [RegExp, unknown[]][] = []) {
  const execute = jest.fn(async (sql: string) => {
    const match = answers.find(([pattern]) => pattern.test(sql));
    return [match ? match[1] : []];
  });
  return { execute } as never as Parameters<typeof resolveRelation>[0] & { execute: jest.Mock };
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

function putRequest(data: string, origin = ORIGIN, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/people/${SELF}/photo`, {
    method: 'PUT',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ data }),
  });
}

function signInAs(role: 'member' | 'admin') {
  jest.mocked(requireApproved).mockResolvedValue({ personId: SELF, role } as never);
}

beforeAll(() => {
  process.env.APP_URL = ORIGIN;
});

describe('photo route', () => {
  const base64 = JPEG.toString('base64');

  beforeEach(() => {
    signInAs('member');
    jest.mocked(getPool).mockReturnValue(fakeDb([[/FROM people/, [{ 1: 1 }]]]) as never);
  });

  it('lets members change only their own photo', async () => {
    expect(await statusOf(PUT(putRequest(base64), { id: SELF }))).toBe(200);
    expect(await statusOf(PUT(putRequest(base64), { id: OTHER }))).toBe(403);
  });

  it('lets admins change anyone', async () => {
    signInAs('admin');
    expect(await statusOf(PUT(putRequest(base64), { id: OTHER }))).toBe(200);
  });

  it('refuses requests from another site', async () => {
    expect(await statusOf(PUT(putRequest(base64, 'https://evil.example'), { id: SELF }))).toBe(403);
    const remove = new Request(`${ORIGIN}/x`, { method: 'DELETE', headers: { Origin: 'https://evil.example' } });
    expect(await statusOf(DELETE(remove, { id: SELF }))).toBe(403);
  });

  it('refuses anything that is not a picture, whatever it claims to be', async () => {
    const svg = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
    expect(await statusOf(PUT(putRequest(svg), { id: SELF }))).toBe(400);
    expect(await statusOf(PUT(putRequest('not base64!'), { id: SELF }))).toBe(400);
  });

  it('refuses oversized photos, before reading them when the size is declared', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(600 * 1024)]).toString('base64');
    expect(await statusOf(PUT(putRequest(big), { id: SELF }))).toBe(413);
    const declared = putRequest(base64, ORIGIN, { 'Content-Length': String(5 * 1024 * 1024) });
    expect(await statusOf(PUT(declared, { id: SELF }))).toBe(413);
  });

  it('stores the type it detected, not one the client sent', async () => {
    const db = fakeDb([[/FROM people/, [{ 1: 1 }]]]);
    jest.mocked(getPool).mockReturnValue(db as never);
    await PUT(putRequest(base64), { id: SELF });
    const [, params] = db.execute.mock.calls.find(([sql]) => /INSERT INTO person_photos/.test(sql)) as [string, unknown[]];
    expect(params[0]).toBe(SELF);
    expect(params[1]).toBe('image/jpeg');
    expect(Buffer.compare(params[2] as Buffer, JPEG)).toBe(0);
  });

  it('serves a photo privately and without letting the browser guess its type', async () => {
    jest
      .mocked(getPool)
      .mockReturnValue(fakeDb([[/FROM person_photos/, [{ contentType: 'image/jpeg', data: JPEG }]]]) as never);
    const response = await GET(new Request(`${ORIGIN}/x`), { id: OTHER });
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(Buffer.from(await response.arrayBuffer()).equals(JPEG)).toBe(true);
  });

  it('answers 404 when there is no photo', async () => {
    jest.mocked(getPool).mockReturnValue(fakeDb() as never);
    expect(await statusOf(GET(new Request(`${ORIGIN}/x`), { id: OTHER }))).toBe(404);
  });
});

describe('resolveRelation', () => {
  const approved: [RegExp, unknown[]] = [/SELECT 1 FROM people/, [{ 1: 1 }]];
  const relation = { relationType: 'sibling' as const, relativeId: SELF, otherParentId: null };

  it('leaves the other relations as they are', async () => {
    const child = { relationType: 'child' as const, relativeId: SELF, otherParentId: OTHER };
    expect(await resolveRelation(fakeDb(), child)).toEqual(child);
  });

  it('turns a sibling into a child of both parents', async () => {
    const db = fakeDb([approved, [/FROM parent_child/, [{ parentId: 'mom' }, { parentId: 'dad' }]]]);
    expect(await resolveRelation(db, relation)).toEqual({
      relationType: 'child',
      relativeId: 'mom',
      otherParentId: 'dad',
    });
  });

  it('turns a sibling into a child of the only known parent', async () => {
    const db = fakeDb([approved, [/FROM parent_child/, [{ parentId: 'mom' }]]]);
    expect(await resolveRelation(db, relation)).toEqual({
      relationType: 'child',
      relativeId: 'mom',
      otherParentId: null,
    });
  });

  it('refuses a sibling when there are no parents, or the person is not in the tree', async () => {
    await expect(resolveRelation(fakeDb([approved]), relation)).rejects.toMatchObject({ status: 409 });
    await expect(resolveRelation(fakeDb(), relation)).rejects.toMatchObject({ status: 400 });
  });

  it('refuses to guess which family the sibling of an adopted person belongs to', async () => {
    const db = fakeDb([
      approved,
      [/FROM parent_child/, [{ parentId: 'uncle', kind: 'adoptive' }, { parentId: 'dad', kind: 'birth' }]],
    ]);
    await expect(resolveRelation(db, relation)).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a chosen second parent on a sibling', async () => {
    await expect(resolveRelation(fakeDb([approved]), { ...relation, otherParentId: OTHER })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('addParentLink', () => {
  const twoAlready: [RegExp, unknown[]] = [/COUNT\(\*\)/, [{ total: 2 }]];
  const noneYet: [RegExp, unknown[]] = [/COUNT\(\*\)/, [{ total: 0 }]];

  it('saves an adoptive parent as adoptive', async () => {
    const db = fakeDb([noneYet]);
    await addParentLink(db, OTHER, SELF, 'adoptive');
    const [, params] = db.execute.mock.calls.find(([sql]) => /INSERT INTO parent_child/.test(sql)) as [string, unknown[]];
    expect(params.slice(0, 3)).toEqual([OTHER, SELF, 'adoptive']);
  });

  it('counts each kind of parent separately', async () => {
    const db = fakeDb([noneYet]);
    await addParentLink(db, OTHER, SELF, 'adoptive');
    const [, params] = db.execute.mock.calls.find(([sql]) => /COUNT\(\*\)/.test(sql)) as [string, unknown[]];
    expect(params).toEqual([SELF, 'adoptive', OTHER]);
  });

  it('refuses a third parent of the same kind', async () => {
    await expect(addParentLink(fakeDb([twoAlready]), OTHER, SELF, 'adoptive')).rejects.toMatchObject({ status: 409 });
    await expect(addParentLink(fakeDb([twoAlready]), OTHER, SELF)).rejects.toMatchObject({ status: 409 });
  });

  it('still refuses to make someone their own ancestor', async () => {
    const db = fakeDb([[/SELECT parent_id/, [{ parentId: SELF, childId: OTHER }]], noneYet]);
    await expect(addParentLink(db, OTHER, SELF, 'adoptive')).rejects.toMatchObject({ status: 409 });
  });
});

describe('assertRelationAllowed', () => {
  const approved: [RegExp, unknown[]] = [/FROM people WHERE id/, [{ 1: 1 }]];
  const child = { relationType: 'child' as const, relativeId: SELF, otherParentId: OTHER };

  it('accepts parents who are not linked as spouses but already share a child', async () => {
    const db = fakeDb([approved, [/JOIN parent_child b/, [{ 1: 1 }]]]);
    await expect(assertRelationAllowed(db, child)).resolves.toBeUndefined();
  });

  it('refuses a second parent who is neither a spouse nor a co-parent', async () => {
    await expect(assertRelationAllowed(fakeDb([approved]), child)).rejects.toMatchObject({ status: 400 });
  });
});
