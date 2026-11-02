import { z } from 'zod';

const FACEBOOK_HOSTS = ['facebook.com', 'fb.com', 'fb.me'];

function isRealDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function isNotInFuture(value: string) {
  return value <= new Date().toISOString().slice(0, 10);
}

export function isFacebookUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      FACEBOOK_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
    );
  } catch {
    return false;
  }
}

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must look like 1980-12-31')
  .refine(isRealDate, 'That date does not exist')
  .refine(isNotInFuture, 'Dates cannot be in the future');

const optionalDate = z.preprocess((value) => (value === '' ? null : value), dateField.nullable());

const facebookField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .max(500, 'That Facebook link is too long')
    .refine(isFacebookUrl, 'Use a full Facebook link starting with https://')
    .nullable()
);

const nameField = z
  .string()
  .trim()
  .min(1, 'Please enter a name')
  .max(200, 'That name is too long');

const idField = z.uuid('Please choose a person');

const relationFields = {
  relationType: z.enum(['spouse', 'child', 'parent']),
  relativeId: idField,
  otherParentId: z.preprocess((value) => (value === '' ? null : value), idField.nullable()).default(null),
};

function deathNotBeforeBirth(person: { birthDate?: string | null; deathDate?: string | null }) {
  return !person.birthDate || !person.deathDate || person.deathDate >= person.birthDate;
}

const DEATH_BEFORE_BIRTH = {
  message: 'The death date cannot be before the birth date',
  path: ['deathDate'],
};

export const emailField = z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email'));
export const passwordField = z
  .string()
  .min(10, 'Passwords need at least 10 characters')
  .max(200, 'That password is too long');

export const loginSchema = z.object({ email: emailField, password: z.string().max(200) });
export const forgotPasswordSchema = z.object({ email: emailField });
export const resetPasswordSchema = z.object({ token: z.string().min(1), password: passwordField });

export const createInviteSchema = z.object(relationFields);

export const acceptInviteSchema = z.object({
  fullName: nameField,
  birthDate: optionalDate,
  facebookUrl: facebookField,
  email: emailField,
  password: passwordField,
});

export const proposeDeceasedSchema = z
  .object({
    ...relationFields,
    fullName: nameField,
    birthDate: optionalDate,
    deathDate: optionalDate,
    facebookUrl: facebookField,
  })
  .refine(deathNotBeforeBirth, DEATH_BEFORE_BIRTH);

export const updateSelfSchema = z.object({
  fullName: nameField,
  birthDate: optionalDate,
  facebookUrl: facebookField,
});

export const adminUpdatePersonSchema = z
  .object({
    fullName: nameField,
    birthDate: optionalDate,
    facebookUrl: facebookField,
    isDeceased: z.boolean(),
    deathDate: optionalDate,
  })
  .refine(deathNotBeforeBirth, DEATH_BEFORE_BIRTH)
  .refine((person) => person.isDeceased || !person.deathDate, {
    message: 'Only deceased relatives can have a death date',
    path: ['deathDate'],
  });

export const relationshipSchema = z
  .object({
    type: z.enum(['spouse', 'parent']),
    // For 'parent', firstId is the parent and secondId is the child
    firstId: idField,
    secondId: idField,
  })
  .refine((relationship) => relationship.firstId !== relationship.secondId, {
    message: 'A person cannot be related to themselves',
  });

export const roleSchema = z.object({ role: z.enum(['member', 'admin']) });
