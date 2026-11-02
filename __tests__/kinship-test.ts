import { relationsTo, relationText, searchPeople } from '@/features/tree/kinship';
import { type Person, type TreeData } from '@/features/tree/use-tree';

function person(id: string, gender: Person['gender'], birthDate: string | null = null): Person {
  return {
    id,
    fullName: id,
    gender,
    birthDate,
    deathDate: null,
    isDeceased: false,
    facebookUrl: null,
    phone: null,
    photoVersion: null,
    hasAccount: false,
    role: 'member',
  };
}

const parents = (childId: string, ...parentIds: string[]) => parentIds.map((parentId) => ({ parentId, childId }));

const family: TreeData = {
  people: [
    person('me', 'male', '1990-01-01'),
    person('wife', 'female', '1991-01-01'),
    person('father', 'male', '1960-01-01'),
    person('mother', 'female', '1962-01-01'),
    person('fatherFather', 'male', '1930-01-01'),
    person('fatherMother', 'female', '1932-01-01'),
    person('motherFather', 'male', '1931-01-01'),
    person('motherMother', 'female', '1933-01-01'),
    person('greatGrandfather', 'male'),
    person('eldestSister', 'female', '1985-01-01'),
    person('secondSister', 'female', '1987-01-01'),
    person('brother', 'male', '1992-01-01'),
    person('sister', 'female', '1994-01-01'),
    person('olderUncle', 'male', '1955-01-01'),
    person('olderUncleWife', 'female', '1956-01-01'),
    person('youngerUncle', 'male', '1965-01-01'),
    person('youngerUncleWife', 'female', '1966-01-01'),
    person('fatherSister', 'female', '1961-01-01'),
    person('fatherSisterHusband', 'male', '1959-01-01'),
    person('motherBrother', 'male', '1964-01-01'),
    person('motherBrotherWife', 'female', '1965-06-01'),
    person('motherSister', 'female', '1966-01-01'),
    person('motherSisterHusband', 'male', '1963-01-01'),
    person('olderCousin', 'female', '1988-01-01'),
    person('youngerCousin', 'male', '1995-01-01'),
    person('son', 'male', '2020-01-01'),
    person('daughter', 'female', '2022-01-01'),
    person('grandchild', null),
    person('nephew', 'male', '2015-01-01'),
    person('eldestSisterHusband', 'male', '1984-01-01'),
    person('fatherInLaw', 'male', '1958-01-01'),
  ],
  spouses: [
    { firstId: 'me', secondId: 'wife' },
    { firstId: 'father', secondId: 'mother' },
    { firstId: 'olderUncle', secondId: 'olderUncleWife' },
    { firstId: 'youngerUncleWife', secondId: 'youngerUncle' },
    { firstId: 'fatherSister', secondId: 'fatherSisterHusband' },
    { firstId: 'motherBrother', secondId: 'motherBrotherWife' },
    { firstId: 'motherSister', secondId: 'motherSisterHusband' },
    { firstId: 'eldestSister', secondId: 'eldestSisterHusband' },
  ],
  parentChild: [
    ...parents('me', 'father', 'mother'),
    ...parents('eldestSister', 'father', 'mother'),
    ...parents('secondSister', 'father', 'mother'),
    ...parents('brother', 'father', 'mother'),
    ...parents('sister', 'father', 'mother'),
    ...parents('father', 'fatherFather', 'fatherMother'),
    ...parents('mother', 'motherFather', 'motherMother'),
    ...parents('fatherFather', 'greatGrandfather'),
    ...parents('olderUncle', 'fatherFather'),
    ...parents('youngerUncle', 'fatherFather'),
    ...parents('fatherSister', 'fatherFather'),
    ...parents('motherBrother', 'motherFather'),
    ...parents('motherSister', 'motherFather'),
    ...parents('olderCousin', 'olderUncle'),
    ...parents('youngerCousin', 'motherSister'),
    ...parents('son', 'me', 'wife'),
    ...parents('daughter', 'me', 'wife'),
    ...parents('grandchild', 'son'),
    ...parents('nephew', 'brother'),
    ...parents('wife', 'fatherInLaw'),
  ],
};

const relations = relationsTo(family, 'me');
const termOf = (id: string) => relations.get(id)?.term;

describe('Chinese family terms', () => {
  it.each([
    ['fatherFather', 'Angkong'],
    ['fatherMother', 'Ama'],
    ['motherFather', 'Guakong'],
    ['motherMother', 'Guama'],
    ['greatGrandfather', 'Tai-kong'],
    ['father', 'Apa'],
    ['mother', 'Abu'],
    ['wife', 'Bo'],
    ['son', 'Hau-se'],
    ['daughter', 'Cha-bo-kia'],
    ['grandchild', 'Sun'],
    ['nephew', 'Sun-a'],
  ])('names %s as %s', (id, term) => {
    expect(termOf(id)).toBe(term);
  });

  it('ranks older siblings by birth order, and has one term each for younger ones', () => {
    expect(termOf('eldestSister')).toBe('Achi');
    expect(termOf('secondSister')).toBe('Dichi');
    expect(termOf('brother')).toBe('Shoti');
    expect(termOf('sister')).toBe('Shobe');
  });

  it('calls the second sister Achi when a missing birthdate leaves the order unclear', () => {
    const tree = {
      ...family,
      people: family.people.map((other) => (other.id === 'sister' ? { ...other, birthDate: null } : other)),
    };
    expect(relationsTo(tree, 'me').get('secondSister')?.term).toBe('Achi');
  });

  it('tells aunts and uncles apart by side and by age against the parent', () => {
    expect(termOf('olderUncle')).toBe('Ah-pe');
    expect(termOf('youngerUncle')).toBe('Ah-tsiak');
    expect(termOf('fatherSister')).toBe('Ah-ko');
    expect(termOf('motherBrother')).toBe('Ah-ku');
    expect(termOf('motherSister')).toBe('Ah-ee');
  });

  it('names an aunt or uncle by marriage through the blood relative', () => {
    expect(termOf('olderUncleWife')).toBe('Ah-um');
    expect(termOf('youngerUncleWife')).toBe('Ah-tsim');
    expect(termOf('fatherSisterHusband')).toBe('Ko-tiu');
    expect(termOf('motherBrotherWife')).toBe('Ah-kim');
    expect(termOf('motherSisterHusband')).toBe('Ee-tiu');
  });

  it('compares cousins against the signed-in person', () => {
    expect(termOf('olderCousin')).toBe('Achi');
    expect(termOf('youngerCousin')).toBe('Shoti');
  });

  it('names an older sibling’s spouse', () => {
    expect(termOf('eldestSisterHusband')).toBe('Chi-hu');
  });

  it('gives in-laws English only, and doesn’t ask for details that wouldn’t help', () => {
    expect(relations.get('fatherInLaw')).toEqual({ term: null, english: 'Father-in-law', incomplete: false });
  });

  it('marks the signed-in person as You', () => {
    expect(relations.get('me')).toEqual({ term: null, english: 'You', incomplete: false });
  });

  it('depends on who is signed in', () => {
    expect(relationsTo(family, 'son').get('fatherFather')?.english).toBe('Great-grandfather');
    expect(relationsTo(family, 'son').get('me')?.term).toBe('Apa');
  });

  it('falls back to English and flags it when a gender or birthdate is missing', () => {
    const tree: TreeData = {
      people: [
        person('me', 'male', '1990-01-01'),
        person('father', null, '1960-01-01'),
        person('unknownGender', null, '1985-01-01'),
        person('unknownAge', 'female'),
        person('grandfather', 'male'),
      ],
      spouses: [],
      parentChild: [
        ...parents('me', 'father'),
        ...parents('unknownGender', 'father'),
        ...parents('unknownAge', 'father'),
        ...parents('father', 'grandfather'),
      ],
    };
    const result = relationsTo(tree, 'me');
    expect(result.get('father')).toEqual({ term: null, english: 'Parent', incomplete: true });
    expect(result.get('unknownGender')).toEqual({ term: null, english: 'Sibling', incomplete: true });
    expect(result.get('unknownAge')).toEqual({ term: null, english: 'Sister', incomplete: true });
    // Which grandfather depends on the side of the family, so on the parent's gender
    expect(result.get('grandfather')).toEqual({ term: null, english: 'Grandfather', incomplete: true });
  });

  it('leaves out people too distant to name, and people not connected at all', () => {
    const tree: TreeData = {
      people: [person('me', 'male'), person('a', 'male'), person('b', 'male'), person('stranger', 'male')],
      spouses: [
        { firstId: 'me', secondId: 'a' },
        { firstId: 'a', secondId: 'b' },
      ],
      parentChild: [],
    };
    const result = relationsTo(tree, 'me');
    expect(result.has('b')).toBe(false);
    expect(result.has('stranger')).toBe(false);
  });

  it('counts an adoptive parent as a parent', () => {
    const tree: TreeData = {
      people: [person('me', 'male'), person('adoptiveFather', 'male')],
      spouses: [],
      parentChild: [{ parentId: 'adoptiveFather', childId: 'me', kind: 'adoptive' }],
    };
    expect(relationsTo(tree, 'me').get('adoptiveFather')?.term).toBe('Apa');
  });

  it('writes the term before the English', () => {
    expect(relationText({ term: 'Achi', english: 'Older sister', incomplete: false })).toBe('Achi · Older sister');
    expect(relationText({ term: null, english: 'Father-in-law', incomplete: false })).toBe('Father-in-law');
  });
});

describe('searchPeople', () => {
  const ids = (query: string) => searchPeople(family.people, relations, query).map((match) => match.id);

  it('finds nobody for an empty search', () => {
    expect(ids('')).toEqual([]);
    expect(ids('   ')).toEqual([]);
  });

  it('finds people by name, in any case', () => {
    expect(ids('FATHERSISTERHUS')).toEqual(['fatherSisterHusband']);
  });

  it('finds people by Chinese term', () => {
    expect(ids('angkong')).toEqual(['fatherFather']);
    expect(ids('achi')).toEqual(['eldestSister', 'olderCousin']);
  });

  it('ignores hyphens and spaces in terms', () => {
    expect(ids('ah-ko')).toEqual(['fatherSister']);
    expect(ids('ahko')).toEqual(['fatherSister']);
    expect(ids('tai kong')).toEqual(['greatGrandfather']);
    expect(ids('taikong')).toEqual(['greatGrandfather']);
  });

  it('matches the start of a word, so one term doesn’t find another', () => {
    expect(ids('kong')).toEqual(['greatGrandfather']);
    expect(ids('ang')).toEqual(['fatherFather']);
  });

  it('accepts other common spellings', () => {
    expect(ids('gwakong')).toEqual(['motherFather']);
    expect(ids('ako')).toEqual(['fatherSister']);
  });

  it('finds people by English relationship, needing every word to match', () => {
    expect(ids('younger cousin')).toEqual(['youngerCousin']);
    expect(ids('father-in-law')).toEqual(['fatherInLaw']);
    expect(ids('nobody here')).toEqual([]);
  });

  it('finds no one when nothing matches', () => {
    expect(ids('zzz')).toEqual([]);
  });
});
