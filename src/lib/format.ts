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

// A shorter version of lifeSpan for the tree's cards
export function yearSpan(person: { birthDate: string | null; deathDate: string | null; isDeceased: boolean }) {
  const born = person.birthDate?.slice(0, 4);
  if (!person.isDeceased) return born ? `Born ${born}` : '';
  const died = person.deathDate?.slice(0, 4);
  return born || died ? `${born ?? '?'} – ${died ?? '?'}` : 'Deceased';
}

export function initialsOf(fullName: string) {
  const words = fullName.trim().split(/\s+/);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export const RELATION_LABELS = {
  spouse: 'spouse',
  child: 'child',
  parent: 'parent',
} as const;
