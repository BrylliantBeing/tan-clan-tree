// CommonJS so that scripts/create-admin.js can use it without a build step.
const { Buffer } = require('buffer');
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function derive(password, salt, cost, blockSize, parallelization, keyLength) {
  return scrypt(password, salt, keyLength, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 256 * cost * blockSize,
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELIZATION, KEY_LENGTH);
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

async function verifyPassword(password, stored) {
  const [scheme, cost, blockSize, parallelization, salt, key] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await derive(
    password,
    Buffer.from(salt, 'base64'),
    Number(cost),
    Number(blockSize),
    Number(parallelization),
    expected.length
  );
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
