/**
 * @jest-environment node
 */
import { hashPassword, verifyPassword } from '@/server/password';
import {
  acceptInviteSchema,
  adminUpdatePersonSchema,
  isFacebookUrl,
  proposeDeceasedSchema,
  relationshipSchema,
} from '@/server/validation';

const RELATIVE_ID = '3f2b1c9e-8a7d-4e6f-9b1a-2c3d4e5f6a7b';

const invitee = {
  fullName: 'Maria Tan',
  birthDate: '1980-02-29',
  facebookUrl: '',
  email: ' Maria@Example.com ',
  password: 'correct horse battery',
};

describe('isFacebookUrl', () => {
  it.each(['https://facebook.com/maria', 'https://www.facebook.com/maria', 'https://m.facebook.com/x', 'https://fb.com/x'])(
    'accepts %s',
    (url) => {
      expect(isFacebookUrl(url)).toBe(true);
    }
  );

  it.each([
    'javascript:alert(1)',
    'http://facebook.com/maria',
    'https://facebook.com.evil.example/maria',
    'https://evilfacebook.com/maria',
    'https://evil.example/?facebook.com',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isFacebookUrl(url)).toBe(false);
  });
});

describe('acceptInviteSchema', () => {
  it('normalizes the email and treats blank optional fields as empty', () => {
    const parsed = acceptInviteSchema.parse({ ...invitee, birthDate: '' });
    expect(parsed.email).toBe('maria@example.com');
    expect(parsed.birthDate).toBeNull();
    expect(parsed.facebookUrl).toBeNull();
  });

  it('accepts a real leap day but refuses an impossible date', () => {
    expect(acceptInviteSchema.safeParse(invitee).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ ...invitee, birthDate: '1981-02-29' }).success).toBe(false);
  });

  it('refuses a birth date in the future', () => {
    expect(acceptInviteSchema.safeParse({ ...invitee, birthDate: '2999-01-01' }).success).toBe(false);
  });

  it('refuses a short password and an unsafe Facebook link', () => {
    expect(acceptInviteSchema.safeParse({ ...invitee, password: 'short' }).success).toBe(false);
    expect(acceptInviteSchema.safeParse({ ...invitee, facebookUrl: 'javascript:alert(1)' }).success).toBe(false);
  });
});

describe('date ordering', () => {
  const deceased = {
    relationType: 'parent',
    relativeId: RELATIVE_ID,
    fullName: 'Jose Tan',
    birthDate: '1950-01-01',
    deathDate: '2010-01-01',
    facebookUrl: null,
  };

  it('allows a death date after the birth date', () => {
    expect(proposeDeceasedSchema.safeParse(deceased).success).toBe(true);
  });

  it('refuses a death date before the birth date', () => {
    expect(proposeDeceasedSchema.safeParse({ ...deceased, deathDate: '1940-01-01' }).success).toBe(false);
  });

  it('allows unknown dates', () => {
    expect(proposeDeceasedSchema.safeParse({ ...deceased, birthDate: null, deathDate: '' }).success).toBe(true);
  });

  it('refuses a death date on someone who is not marked deceased', () => {
    const person = {
      fullName: 'Jose Tan',
      birthDate: null,
      facebookUrl: null,
      isDeceased: false,
      deathDate: '2010-01-01',
    };
    expect(adminUpdatePersonSchema.safeParse(person).success).toBe(false);
  });
});

describe('relationshipSchema', () => {
  it('refuses relating a person to themselves', () => {
    const relationship = { type: 'spouse', firstId: RELATIVE_ID, secondId: RELATIVE_ID };
    expect(relationshipSchema.safeParse(relationship).success).toBe(false);
  });
});

describe('passwords', () => {
  it('verifies the right password and refuses the wrong one', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).not.toContain('correct horse');
    await expect(verifyPassword('correct horse battery', stored)).resolves.toBe(true);
    await expect(verifyPassword('wrong password here', stored)).resolves.toBe(false);
  });

  it('salts each hash differently', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'));
  });
});
