import crypto from 'crypto';

export function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newId() {
  return crypto.randomUUID();
}
