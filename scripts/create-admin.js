// Creates an approved admin. Run with: npm run db:create-admin
const crypto = require('crypto');
const readline = require('readline/promises');
const mysql = require('mysql2/promise');

const { hashPassword } = require('../src/server/password.js');

const MIN_PASSWORD_LENGTH = 10;

async function main() {
  const prompts = readline.createInterface({ input: process.stdin, output: process.stdout });
  const fullName = (await prompts.question('Full name: ')).trim();
  const email = (await prompts.question('Email: ')).trim().toLowerCase();
  const password = await prompts.question('Password: ');
  prompts.close();

  if (!fullName || !email.includes('@')) throw new Error('A name and a valid email are required');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  try {
    await connection.beginTransaction();

    // Attach to a profile with this exact name if it is already in the tree, so there is no duplicate
    const [profiles] = await connection.execute(
      `SELECT p.id
       FROM people p
       LEFT JOIN accounts a ON a.person_id = p.id
       WHERE p.full_name = ? AND p.status = 'approved' AND p.is_deceased = 0 AND a.id IS NULL`,
      [fullName]
    );
    if (profiles.length > 1) throw new Error(`More than one profile is named ${fullName}`);

    const personId = profiles[0]?.id ?? crypto.randomUUID();
    if (profiles[0]) {
      console.log('Attaching the login to the existing profile with that name');
    } else {
      await connection.execute(
        `INSERT INTO people (id, full_name, status, reviewed_at) VALUES (?, ?, 'approved', UTC_TIMESTAMP())`,
        [personId, fullName]
      );
    }
    await connection.execute(
      `INSERT INTO accounts (id, person_id, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`,
      [crypto.randomUUID(), personId, email, await hashPassword(password)]
    );
    await connection.commit();
    console.log(`Admin created for ${email}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
