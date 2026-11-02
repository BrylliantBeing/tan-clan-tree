/**
 * @jest-environment node
 */
import { hashPassword, verifyPassword } from '@/server/password';
import { detectPhotoType } from '@/server/photos';
import {
  acceptInviteSchema,
  adminUpdatePersonSchema,
  isFacebookUrl,
  proposeDeceasedSchema,
  relationshipSchema,
  updateSelfSchema,
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
      phone: null,
      isDeceased: false,
      deathDate: '2010-01-01',
    };
    expect(adminUpdatePersonSchema.safeParse(person).success).toBe(false);
  });
});

describe('gender', () => {
  const details = { fullName: 'Maria Tan', birthDate: '', facebookUrl: '', phone: '' };

  it('treats a blank choice as not set', () => {
    expect(updateSelfSchema.parse({ ...details, gender: '' }).gender).toBeNull();
    expect(updateSelfSchema.parse({ ...details, gender: 'female' }).gender).toBe('female');
  });

  it('refuses anything other than the choices offered', () => {
    expect(updateSelfSchema.safeParse({ ...details, gender: 'other' }).success).toBe(false);
  });

  it('has to be sent with an edit, so an old open page cannot blank it', () => {
    expect(updateSelfSchema.safeParse(details).success).toBe(false);
  });

  it('can be left out when someone new joins', () => {
    expect(acceptInviteSchema.parse(invitee).gender).toBeNull();
  });
});

describe('contact numbers', () => {
  const details = { fullName: 'Maria Tan', gender: '', birthDate: '', facebookUrl: '' };

  it.each(['+63 917 123 4567', '0917-123-4567', '(02) 8123 4567', '09171234567'])('accepts %s', (phone) => {
    expect(updateSelfSchema.safeParse({ ...details, phone }).success).toBe(true);
  });

  it.each(['javascript:alert(1)', 'call me', '123', '+63 917 123 4567?x=1', `${'1'.repeat(41)}`])('refuses %s', (phone) => {
    expect(updateSelfSchema.safeParse({ ...details, phone }).success).toBe(false);
  });

  it('treats a blank number as none', () => {
    expect(updateSelfSchema.parse({ ...details, phone: '  ' }).phone).toBeNull();
  });
});

describe('detectPhotoType', () => {
  const bytes = (...values: number[]) => new Uint8Array(values);

  it('recognizes pictures from their contents', () => {
    expect(detectPhotoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(detectPhotoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(
      detectPhotoType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))
    ).toBe('image/webp');
  });

  it('refuses anything else, including pages and SVG', () => {
    const text = (value: string) => new TextEncoder().encode(value);
    expect(detectPhotoType(text('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(detectPhotoType(text('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectPhotoType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20))).toBeNull();
    expect(detectPhotoType(bytes())).toBeNull();
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
