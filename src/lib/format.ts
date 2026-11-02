const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

export function formatDate(value: string | null) {
  return value ? DATE_FORMAT.format(new Date(`${value}T00:00:00Z`)) : 'Unknown';
}

export function lifeSpan(person: { birthDate: string | null; deathDate: string | null; isDeceased: boolean }) {
  if (!person.isDeceased) return person.birthDate ? `Born ${formatDate(person.birthDate)}` : '';
  return `${formatDate(person.birthDate)} – ${formatDate(person.deathDate)}`;
}

export const RELATION_LABELS = {
  spouse: 'spouse',
  child: 'child',
  parent: 'parent',
} as const;
