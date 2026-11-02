// End-to-end check of the approval and permission rules, against a running production build.
//
// It writes test people to the database, so it refuses to run unless DB_NAME contains "test".
//   1. Create an empty database with "test" in its name, and put its details in .env.test.local
//   2. node --env-file=.env.test.local scripts/migrate.js
//   3. npm run build, then: node --env-file=.env.test.local server.js
//   4. In another terminal: npm run test:e2e
const assert = require('assert/strict');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const { hashPassword } = require('../src/server/password.js');

const BASE_URL = process.env.APP_URL;
const PASSWORD = 'a long test password';
const RUN = crypto.randomBytes(4).toString('hex');

if (!/test/i.test(process.env.DB_NAME ?? '')) {
  console.error('Refusing to run: DB_NAME must contain "test", because this script writes test people.');
  process.exit(1);
}

const email = (name) => `${name}-${RUN}@example.com`;

class Browser {
  cookie = null;

  async request(method, path, body, { origin = BASE_URL } = {}) {
    const response = await fetch(BASE_URL + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      this.cookie = pair.endsWith('=') ? null : pair;
    }
    return { status: response.status, body: await response.json().catch(() => null), setCookie };
  }

  get(path) {
    return this.request('GET', path);
  }
  post(path, body) {
    return this.request('POST', path, body);
  }
  patch(path, body) {
    return this.request('PATCH', path, body);
  }
  put(path, body) {
    return this.request('PUT', path, body);
  }
  delete(path, body) {
    return this.request('DELETE', path, body);
  }
  signIn(address, password = PASSWORD) {
    return this.post('/api/auth/login', { email: address, password });
  }
}

const tokenOf = (url) => url.split('/invite/')[1];

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  const passed = [];
  const step = async (name, work) => {
    await work();
    passed.push(name);
    console.log(`ok - ${name}`);
  };

  const invite = async (browser, relationType, relativeId, otherParentId = null) => {
    const result = await browser.post('/api/invites', { relationType, relativeId, otherParentId });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return tokenOf(result.body.url);
  };
  const claim = (browser, token, name) =>
    browser.post(`/api/invite-links/${token}/accept`, {
      fullName: `${name} ${RUN}`,
      birthDate: '1990-05-17',
      facebookUrl: `https://facebook.com/${name}`,
      email: email(name),
      password: PASSWORD,
    });
  const personId = async (browser) => (await browser.get('/api/auth/me')).body.user.personId;

  const admin = new Browser();
  const adminPersonId = crypto.randomUUID();

  await step('an admin can sign in', async () => {
    await db.execute(`INSERT INTO people (id, full_name, status) VALUES (?, ?, 'approved')`, [
      adminPersonId,
      `Admin ${RUN}`,
    ]);
    await db.execute(`INSERT INTO accounts (id, person_id, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`, [
      crypto.randomUUID(),
      adminPersonId,
      email('admin'),
      await hashPassword(PASSWORD),
    ]);
    assert.equal((await admin.signIn(email('admin'))).status, 200);
    assert.equal((await admin.get('/api/auth/me')).body.user.role, 'admin');
  });

  await step('session cookie is HttpOnly and SameSite=Lax', async () => {
    const result = await new Browser().signIn(email('admin'));
    assert.match(result.setCookie, /HttpOnly/);
    assert.match(result.setCookie, /SameSite=Lax/);
  });

  await step('signed-out visitors get nothing from the tree', async () => {
    assert.equal((await new Browser().get('/api/tree')).status, 401);
  });

  const alice = new Browser();
  let aliceToken;
  let aliceId;

  await step('an invite shows who it is from, and is claimed into a pending account', async () => {
    aliceToken = await invite(admin, 'child', adminPersonId);
    const preview = await new Browser().get(`/api/invite-links/${aliceToken}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.invite.inviterName, `Admin ${RUN}`);
    assert.equal((await claim(alice, aliceToken, 'alice')).status, 201);
    const me = await alice.get('/api/auth/me');
    assert.equal(me.body.user.status, 'pending');
    aliceId = me.body.user.personId;
  });

  await step('a pending member cannot see the tree or invite anyone', async () => {
    assert.equal((await alice.get('/api/tree')).status, 403);
    const attempt = await alice.post('/api/invites', {
      relationType: 'child',
      relativeId: adminPersonId,
      otherParentId: null,
    });
    assert.equal(attempt.status, 403);
  });

  await step('a pending person stays out of the tree until approved', async () => {
    const before = await admin.get('/api/tree');
    assert.ok(!before.body.people.some((person) => person.id === aliceId));
    assert.ok(!before.body.parentChild.some((link) => link.childId === aliceId));
    assert.equal((await admin.post(`/api/admin/approvals/${aliceId}`)).status, 200);
    const after = await alice.get('/api/tree');
    assert.equal(after.status, 200);
    assert.ok(after.body.people.some((person) => person.id === aliceId));
    assert.ok(after.body.parentChild.some((link) => link.childId === aliceId && link.parentId === adminPersonId));
    assert.equal(after.body.people[0].email, undefined);
  });

  await step('an addition cannot be reviewed twice', async () => {
    assert.equal((await admin.post(`/api/admin/approvals/${aliceId}`)).status, 409);
  });

  await step('used, revoked and expired invite links are refused', async () => {
    assert.equal((await claim(new Browser(), aliceToken, 'reuse')).status, 404);

    const revokedToken = await invite(alice, 'spouse', aliceId);
    const { body } = await alice.get('/api/invites');
    const active = body.invites.find((candidate) => candidate.status === 'active');
    assert.equal((await alice.delete(`/api/invites/${active.id}`)).status, 200);
    assert.equal((await claim(new Browser(), revokedToken, 'revoked')).status, 404);

    const expiredToken = await invite(alice, 'spouse', aliceId);
    await db.execute('UPDATE invites SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE token_hash = ?', [
      crypto.createHash('sha256').update(expiredToken).digest('hex'),
    ]);
    assert.equal((await claim(new Browser(), expiredToken, 'expired')).status, 404);
  });

  await step('only one of two simultaneous claims on a link succeeds', async () => {
    const token = await invite(alice, 'spouse', aliceId);
    const results = await Promise.all([claim(new Browser(), token, 'race1'), claim(new Browser(), token, 'race2')]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 404]);
    const [[row]] = await db.execute(`SELECT p.id FROM people p JOIN accounts a ON a.person_id = p.id WHERE a.email IN (?, ?)`, [
      email('race1'),
      email('race2'),
    ]);
    await admin.delete(`/api/admin/approvals/${row.id}`);
  });

  await step('an email can only be used for one account', async () => {
    const token = await invite(alice, 'spouse', aliceId);
    const result = await new Browser().post(`/api/invite-links/${token}/accept`, {
      fullName: 'Duplicate',
      birthDate: '',
      facebookUrl: '',
      email: email('ALICE').toUpperCase(),
      password: PASSWORD,
    });
    assert.equal(result.status, 409);
  });

  await step('a rejected person leaves no relationship behind and cannot sign in', async () => {
    const bob = new Browser();
    await claim(bob, await invite(alice, 'spouse', aliceId), 'bob');
    const bobId = await personId(bob);
    assert.equal((await admin.delete(`/api/admin/approvals/${bobId}`)).status, 200);
    const tree = await admin.get('/api/tree');
    assert.ok(!tree.body.people.some((person) => person.id === bobId));
    assert.ok(!tree.body.spouses.some((pair) => pair.firstId === bobId || pair.secondId === bobId));
    assert.equal((await bob.get('/api/auth/me')).body.user, null);
    assert.equal((await new Browser().signIn(email('bob'))).status, 401);
  });

  let spouse1;
  let spouse2;

  await step('a person can have two spouses, with a child from each', async () => {
    const addApproved = async (relationType, relativeId, otherParentId, name) => {
      const browser = new Browser();
      await claim(browser, await invite(alice, relationType, relativeId, otherParentId), name);
      const id = await personId(browser);
      assert.equal((await admin.post(`/api/admin/approvals/${id}`)).status, 200);
      return { browser, id };
    };
    spouse1 = await addApproved('spouse', aliceId, null, 'spouse1');
    spouse2 = await addApproved('spouse', aliceId, null, 'spouse2');
    const child1 = await addApproved('child', aliceId, spouse1.id, 'child1');
    const child2 = await addApproved('child', aliceId, spouse2.id, 'child2');

    const { body } = await admin.get('/api/tree');
    const parentsOf = (childId) =>
      body.parentChild
        .filter((link) => link.childId === childId)
        .map((link) => link.parentId)
        .sort();
    assert.deepEqual(parentsOf(child1.id), [aliceId, spouse1.id].sort());
    assert.deepEqual(parentsOf(child2.id), [aliceId, spouse2.id].sort());
  });

  await step('a second parent must be a spouse of the first', async () => {
    const result = await alice.post('/api/invites', {
      relationType: 'child',
      relativeId: spouse1.id,
      otherParentId: spouse2.id,
    });
    assert.equal(result.status, 400);
  });

  await step('a third parent is refused', async () => {
    const result = await alice.post('/api/invites', {
      relationType: 'parent',
      relativeId: (await spouse1.browser.get('/api/tree')).body.parentChild.find((link) => link.parentId === spouse1.id).childId,
      otherParentId: null,
    });
    assert.equal(result.status, 409);
  });

  await step('a sibling joins under the same parents, even when the parents are not linked as spouses', async () => {
    const child = spouse1.id;
    const parentA = crypto.randomUUID();
    const parentB = crypto.randomUUID();
    for (const [id, name] of [[parentA, 'Parent A'], [parentB, 'Parent B']]) {
      await db.execute(`INSERT INTO people (id, full_name, status) VALUES (?, ?, 'approved')`, [id, `${name} ${RUN}`]);
      await db.execute('INSERT INTO parent_child (parent_id, child_id) VALUES (?, ?)', [id, child]);
    }

    const browser = new Browser();
    await claim(browser, await invite(alice, 'sibling', child), 'sibling');
    const siblingId = await personId(browser);
    assert.equal((await admin.post(`/api/admin/approvals/${siblingId}`)).status, 200);
    const { body } = await admin.get('/api/tree');
    const parents = body.parentChild.filter((link) => link.childId === siblingId).map((link) => link.parentId);
    assert.deepEqual(parents.sort(), [parentA, parentB].sort());
  });

  await step('a deceased sibling also joins under the same parents', async () => {
    const proposed = await alice.post('/api/people', {
      relationType: 'sibling',
      relativeId: spouse1.id,
      otherParentId: null,
      fullName: `Late Sibling ${RUN}`,
      birthDate: '',
      deathDate: '',
      facebookUrl: '',
    });
    assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
    assert.equal((await admin.post(`/api/admin/approvals/${proposed.body.id}`)).status, 200);
    const { body } = await admin.get('/api/tree');
    assert.equal(body.parentChild.filter((link) => link.childId === proposed.body.id).length, 2);
  });

  await step('a sibling is refused when there are no parents to share', async () => {
    const result = await alice.post('/api/invites', { relationType: 'sibling', relativeId: adminPersonId, otherParentId: null });
    assert.equal(result.status, 409);
  });

  await step('only spouses or existing co-parents can be chosen as a second parent', async () => {
    const stranger = crypto.randomUUID();
    await db.execute(`INSERT INTO people (id, full_name, status) VALUES (?, ?, 'approved')`, [stranger, `Stranger ${RUN}`]);
    const result = await alice.post('/api/invites', { relationType: 'child', relativeId: aliceId, otherParentId: stranger });
    assert.equal(result.status, 400);
  });

  await step('a contact number is saved and shown to the family, and unsafe ones are refused', async () => {
    const details = { fullName: `alice ${RUN}`, birthDate: '1990-05-17', facebookUrl: '' };
    assert.equal((await alice.patch(`/api/people/${aliceId}`, { ...details, phone: '+63 917 123 4567' })).status, 200);
    const { body } = await spouse2.browser.get('/api/tree');
    assert.equal(body.people.find((person) => person.id === aliceId).phone, '+63 917 123 4567');
    assert.equal((await alice.patch(`/api/people/${aliceId}`, { ...details, phone: 'javascript:alert(1)' })).status, 400);
    assert.equal((await alice.patch(`/api/people/${aliceId}`, details)).status, 400);
  });

  await step('photos are private, limited to pictures, and editable only by their owner or an admin', async () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(2048)]);
    const data = jpeg.toString('base64');
    const path = `/api/people/${aliceId}/photo`;
    const before = (await alice.get('/api/tree')).body.people.find((person) => person.id === aliceId);
    assert.equal(before.photoVersion, null);

    assert.equal((await spouse2.browser.put(path, { data })).status, 403);
    assert.equal((await alice.put(path, { data: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64') })).status, 400);
    assert.equal((await alice.put(path, { data: 'not base64!' })).status, 400);
    assert.equal((await alice.put(path, { data: Buffer.concat([jpeg, Buffer.alloc(600 * 1024)]).toString('base64') })).status, 413);
    assert.equal((await alice.request('PUT', path, { data }, { origin: 'https://evil.example' })).status, 403);

    assert.equal((await alice.put(path, { data })).status, 200);
    const after = (await alice.get('/api/tree')).body.people.find((person) => person.id === aliceId);
    assert.notEqual(after.photoVersion, null);

    assert.equal((await new Browser().get(path)).status, 401);
    const response = await fetch(BASE_URL + path, { headers: { Cookie: spouse2.browser.cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(jpeg));

    assert.equal((await spouse2.browser.delete(path)).status, 403);
    assert.equal((await admin.put(path, { data })).status, 200);
    assert.equal((await alice.delete(path)).status, 200);
    assert.equal((await alice.get(path)).status, 404);
  });

  let deceasedId;

  await step('a proposed deceased relative needs approval and has no login', async () => {
    const proposed = await alice.post('/api/people', {
      relationType: 'parent',
      relativeId: aliceId,
      otherParentId: null,
      fullName: `Ancestor ${RUN}`,
      birthDate: '1920-01-01',
      deathDate: '1990-01-01',
      facebookUrl: '',
    });
    assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
    deceasedId = proposed.body.id;
    assert.ok(!(await alice.get('/api/tree')).body.people.some((person) => person.id === deceasedId));
    const { body } = await admin.get('/api/admin/approvals');
    assert.equal(body.approvals.find((approval) => approval.id === deceasedId).email, null);
    assert.equal((await admin.post(`/api/admin/approvals/${deceasedId}`)).status, 200);
    const person = (await alice.get('/api/tree')).body.people.find((candidate) => candidate.id === deceasedId);
    assert.equal(person.isDeceased, true);
    assert.equal(person.hasAccount, false);
  });

  await step('a login link attaches to an existing profile, with no duplicate person', async () => {
    const profileId = crypto.randomUUID();
    await db.execute(`INSERT INTO people (id, full_name, birth_date, status) VALUES (?, ?, '1975-01-31', 'approved')`, [
      profileId,
      `Profile ${RUN}`,
    ]);
    const link = { personId: profileId };

    assert.equal((await alice.post('/api/admin/claim-invites', link)).status, 403);
    assert.equal((await admin.post('/api/admin/claim-invites', { personId: deceasedId })).status, 400);
    assert.equal((await admin.post('/api/admin/claim-invites', { personId: aliceId })).status, 409);

    const older = tokenOf((await admin.post('/api/admin/claim-invites', link)).body.url);
    const created = await admin.post('/api/admin/claim-invites', link);
    assert.equal(created.status, 201);
    const token = tokenOf(created.body.url);
    const details = { facebookUrl: '', email: email('profile'), password: PASSWORD };

    assert.equal((await new Browser().post(`/api/invite-links/${older}/claim`, details)).status, 404);
    const preview = await new Browser().get(`/api/invite-links/${token}`);
    assert.equal(preview.body.invite.claimName, `Profile ${RUN}`);
    assert.equal((await claim(new Browser(), token, 'wrongroute')).status, 404);

    const before = (await admin.get('/api/tree')).body.people.length;
    const owner = new Browser();
    assert.equal((await owner.post(`/api/invite-links/${token}/claim`, details)).status, 201);
    const me = (await owner.get('/api/auth/me')).body.user;
    assert.equal(me.personId, profileId);
    assert.equal(me.status, 'approved');
    assert.equal(me.role, 'member');
    assert.equal((await owner.get('/api/tree')).body.people.length, before);
    assert.equal((await new Browser().post(`/api/invite-links/${token}/claim`, {
      ...details,
      email: email('profile2'),
    })).status, 404);
    assert.equal((await admin.post('/api/admin/claim-invites', link)).status, 409);
  });

  await step('marking a profile deceased cancels its login link', async () => {
    const profileId = crypto.randomUUID();
    await db.execute(`INSERT INTO people (id, full_name, status) VALUES (?, ?, 'approved')`, [
      profileId,
      `Second Profile ${RUN}`,
    ]);
    const token = tokenOf((await admin.post('/api/admin/claim-invites', { personId: profileId })).body.url);
    const update = await admin.patch(`/api/people/${profileId}`, {
      fullName: `Second Profile ${RUN}`,
      birthDate: '',
      facebookUrl: '',
      phone: '',
      isDeceased: true,
      deathDate: '',
    });
    assert.equal(update.status, 200, JSON.stringify(update.body));
    assert.equal((await new Browser().get(`/api/invite-links/${token}`)).status, 404);
  });

  await step('members can edit only themselves, and cannot change their own status', async () => {
    const details = { fullName: 'Hacked', birthDate: '', facebookUrl: '', phone: '' };
    assert.equal((await alice.patch(`/api/people/${deceasedId}`, details)).status, 403);
    assert.equal((await alice.patch(`/api/people/${adminPersonId}`, details)).status, 403);
    const own = await alice.patch(`/api/people/${aliceId}`, {
      fullName: `Alice Edited ${RUN}`,
      birthDate: '1990-05-17',
      facebookUrl: '',
      phone: '',
      isDeceased: true,
    });
    assert.equal(own.status, 200);
    const me = (await alice.get('/api/tree')).body.people.find((person) => person.id === aliceId);
    assert.equal(me.fullName, `Alice Edited ${RUN}`);
    assert.equal(me.isDeceased, false);
  });

  await step('members cannot use admin routes', async () => {
    assert.equal((await alice.get('/api/admin/approvals')).status, 403);
    assert.equal((await alice.post(`/api/admin/approvals/${deceasedId}`)).status, 403);
    assert.equal((await alice.put(`/api/admin/roles/${aliceId}`, { role: 'admin' })).status, 403);
    const link = { type: 'spouse', firstId: aliceId, secondId: adminPersonId };
    assert.equal((await alice.post('/api/admin/relationships', link)).status, 403);
  });

  await step('unsafe Facebook links are refused', async () => {
    const result = await alice.patch(`/api/people/${aliceId}`, {
      fullName: 'Alice',
      birthDate: '',
      facebookUrl: 'javascript:alert(1)',
      phone: '',
    });
    assert.equal(result.status, 400);
  });

  await step('requests from another site are refused', async () => {
    const result = await alice.request('POST', '/api/invites', { relationType: 'child', relativeId: aliceId }, {
      origin: 'https://evil.example',
    });
    assert.equal(result.status, 403);
    const noOrigin = await alice.request('POST', '/api/auth/logout', undefined, { origin: null });
    assert.equal(noOrigin.status, 403);
  });

  await step('relationships cannot make someone their own ancestor', async () => {
    const result = await admin.post('/api/admin/relationships', {
      type: 'parent',
      firstId: aliceId,
      secondId: adminPersonId,
    });
    assert.equal(result.status, 409);
  });

  await step('admins can add and remove a relationship', async () => {
    const link = { type: 'spouse', firstId: spouse1.id, secondId: adminPersonId };
    assert.equal((await admin.post('/api/admin/relationships', link)).status, 201);
    assert.equal((await admin.delete('/api/admin/relationships', link)).status, 200);
  });

  await step('an admin can add someone straight to the tree, and members cannot', async () => {
    const details = {
      relationType: 'child',
      relativeId: aliceId,
      otherParentId: null,
      fullName: `Direct ${RUN}`,
      birthDate: '2001-02-03',
      facebookUrl: '',
      phone: '+63 917 123 4567',
      isDeceased: false,
      deathDate: '',
    };
    assert.equal((await alice.post('/api/admin/people', details)).status, 403);
    assert.equal((await admin.request('POST', '/api/admin/people', details, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await admin.post('/api/admin/people', { ...details, deathDate: '2010-01-01' })).status, 400);

    const added = await admin.post('/api/admin/people', details);
    assert.equal(added.status, 201, JSON.stringify(added.body));
    const { id } = added.body;

    const { body } = await alice.get('/api/tree');
    const person = body.people.find((candidate) => candidate.id === id);
    assert.equal(person.phone, details.phone);
    assert.equal(person.hasAccount, false);
    assert.ok(body.parentChild.some((link) => link.parentId === aliceId && link.childId === id));
    const { approvals } = (await admin.get('/api/admin/approvals')).body;
    assert.ok(!approvals.some((approval) => approval.id === id));

    assert.equal((await admin.post('/api/admin/claim-invites', { personId: id })).status, 201);
  });

  await step('the last admin cannot be removed, but a second admin makes it possible', async () => {
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM accounts WHERE role = 'admin' AND disabled_at IS NULL`);
    assert.equal(Number(total), 1, 'this step expects a freshly migrated test database');
    assert.equal((await admin.put(`/api/admin/roles/${adminPersonId}`, { role: 'member' })).status, 409);
    assert.equal((await admin.put(`/api/admin/roles/${spouse2.id}`, { role: 'admin' })).status, 200);
    assert.equal((await spouse2.browser.get('/api/admin/approvals')).status, 200);
    assert.equal((await admin.put(`/api/admin/roles/${spouse2.id}`, { role: 'member' })).status, 200);
    assert.equal((await spouse2.browser.get('/api/admin/approvals')).status, 403);
  });

  await step('marking someone deceased ends their session and login, and revokes their invites', async () => {
    const token = await invite(spouse1.browser, 'child', spouse1.id);
    const result = await admin.patch(`/api/people/${spouse1.id}`, {
      fullName: `spouse1 ${RUN}`,
      birthDate: '1990-05-17',
      facebookUrl: '',
      phone: '',
      isDeceased: true,
      deathDate: '2020-01-01',
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal((await spouse1.browser.get('/api/auth/me')).body.user, null);
    assert.equal((await new Browser().signIn(email('spouse1'))).status, 401);
    assert.equal((await new Browser().get(`/api/invite-links/${token}`)).status, 404);
  });

  await step('password reset works once, ends other sessions and replaces the old password', async () => {
    const token = crypto.randomBytes(32).toString('base64url');
    const [[account]] = await db.execute('SELECT id FROM accounts WHERE email = ?', [email('child1')]);
    const session = new Browser();
    await session.signIn(email('child1'));
    await db.execute(
      `INSERT INTO password_resets (token_hash, account_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))`,
      [crypto.createHash('sha256').update(token).digest('hex'), account.id]
    );
    const body = { token, password: 'a brand new password' };
    assert.equal((await new Browser().post('/api/auth/reset-password', body)).status, 200);
    assert.equal((await new Browser().post('/api/auth/reset-password', body)).status, 400);
    assert.equal((await session.get('/api/auth/me')).body.user, null);
    assert.equal((await new Browser().signIn(email('child1'))).status, 401);
    assert.equal((await new Browser().signIn(email('child1'), 'a brand new password')).status, 200);
  });

  await step('forgot password answers the same whether or not the email exists', async () => {
    const known = await new Browser().post('/api/auth/forgot-password', { email: email('child2') });
    const unknown = await new Browser().post('/api/auth/forgot-password', { email: email('nobody') });
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body);
  });

  await step('repeated failed logins are locked out, even with the right password', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await new Browser().signIn(email('child2'), 'wrong password')).status, 401);
    }
    assert.equal((await new Browser().signIn(email('child2'))).status, 429);
  });

  await step('signing out ends the session', async () => {
    const browser = new Browser();
    await browser.signIn(email('admin'));
    const stolenCookie = browser.cookie;
    assert.equal((await browser.post('/api/auth/logout')).status, 200);
    const replay = new Browser();
    replay.cookie = stolenCookie;
    assert.equal((await replay.get('/api/auth/me')).body.user, null);
  });

  await db.end();
  console.log(`\nAll ${passed.length} end-to-end checks passed`);
}

main().catch((error) => {
  console.error('\nFAILED:', error.message);
  process.exit(1);
});
