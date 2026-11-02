import { type Person, type TreeData } from './use-tree';

// What someone is to the signed-in person. The terms are Philippine Hokkien, and their spelling varies by family.
export type Relation = {
  // Null when there's no term to show, so only the English is shown
  term: string | null;
  english: string;
  // True when a gender or birthdate missing from the tree is what's holding back the term
  incomplete: boolean;
};

const named = (term: string, english: string): Relation => ({ term, english, incomplete: false });
const englishOnly = (english: string): Relation => ({ term: null, english, incomplete: false });
const incomplete = (english: string): Relation => ({ term: null, english, incomplete: true });

// Ranked by birth order among brothers or among sisters
const ELDER_BROTHERS = ['Ahia', 'Dihia', 'Sahia'];
const ELDER_SISTERS = ['Achi', 'Dichi', 'Sachi'];

// Other spellings people may type when searching
const ALSO_SPELLED: Record<string, string> = {
  Ahia: 'Ahiya',
  Achi: 'Achie',
  Ama: 'Ahma',
  Guakong: 'Gwakong',
  Guama: 'Gwama',
  'Ah-pe': 'Apeh Ape',
  'Ah-tsiak': 'Achek Atsiak',
  'Ah-ko': 'Ako',
  'Ah-um': 'Aum',
  'Ah-tsim': 'Atsim',
  'Ah-ku': 'Aku',
  'Ah-ee': 'Ayi Aee',
  'Ah-kim': 'Akim',
  'Ko-tiu': 'Kothiu',
  'Ee-tiu': 'Ithiu',
};

function byGender(person: Person, male: Relation, female: Relation, neutral: string) {
  if (person.gender === 'male') return male;
  if (person.gender === 'female') return female;
  return incomplete(neutral);
}

// Null when it can't be told, including for twins
function isOlder(person: Person, than: Person) {
  if (!person.birthDate || !than.birthDate || person.birthDate === than.birthDate) return null;
  return person.birthDate < than.birthDate;
}

// How many brothers or sisters came before this person. Zero, the plain term, unless all their siblings are filled in.
function elderRank(tree: TreeData, person: Person) {
  const parentIds = tree.parentChild.filter((link) => link.childId === person.id).map((link) => link.parentId);
  const siblingIds = new Set(
    tree.parentChild.filter((link) => parentIds.includes(link.parentId)).map((link) => link.childId)
  );
  const siblings = tree.people.filter((other) => siblingIds.has(other.id));
  if (siblings.some((other) => !other.gender || !other.birthDate)) return 0;
  return siblings.filter((other) => other.gender === person.gender && isOlder(other, person)).length;
}

function sibling(tree: TreeData, self: Person, person: Person) {
  if (!person.gender) return incomplete('Sibling');
  const isMale = person.gender === 'male';
  const older = isOlder(person, self);
  if (older === null) return incomplete(isMale ? 'Brother' : 'Sister');
  if (!older) return isMale ? named('Shoti', 'Younger brother') : named('Shobe', 'Younger sister');
  const terms = isMale ? ELDER_BROTHERS : ELDER_SISTERS;
  return named(terms[elderRank(tree, person)] ?? terms[0], isMale ? 'Older brother' : 'Older sister');
}

function cousin(self: Person, person: Person) {
  const older = isOlder(person, self);
  if (!person.gender || older === null) return incomplete('Cousin');
  if (older) return named(person.gender === 'male' ? 'Ahia' : 'Achi', 'Older cousin');
  return named(person.gender === 'male' ? 'Shoti' : 'Shobe', 'Younger cousin');
}

function grandparent(parent: Person, person: Person) {
  if (!parent.gender) return byGender(person, incomplete('Grandfather'), incomplete('Grandmother'), 'Grandparent');
  const isPaternal = parent.gender === 'male';
  return byGender(
    person,
    isPaternal ? named('Angkong', 'Paternal grandfather') : named('Guakong', 'Maternal grandfather'),
    isPaternal ? named('Ama', 'Paternal grandmother') : named('Guama', 'Maternal grandmother'),
    'Grandparent'
  );
}

function auntOrUncle(parent: Person, person: Person) {
  if (!parent.gender) return byGender(person, incomplete('Uncle'), incomplete('Aunt'), 'Aunt or uncle');
  if (parent.gender === 'female') {
    return byGender(person, named('Ah-ku', "Mother's brother"), named('Ah-ee', "Mother's sister"), 'Aunt or uncle');
  }
  const older = isOlder(person, parent);
  const brother =
    older === null
      ? incomplete("Father's brother")
      : older
        ? named('Ah-pe', "Father's older brother")
        : named('Ah-tsiak', "Father's younger brother");
  return byGender(person, brother, named('Ah-ko', "Father's sister"), 'Aunt or uncle');
}

// These terms depend on the parent's sibling, the blood relative, rather than on the person who married them
function auntOrUncleByMarriage(parent: Person, relative: Person, person: Person) {
  const english = person.gender === 'male' ? 'Uncle by marriage' : person.gender === 'female' ? 'Aunt by marriage' : 'Aunt or uncle by marriage';
  if (!parent.gender || !relative.gender) return incomplete(english);
  if (parent.gender === 'female') return named(relative.gender === 'male' ? 'Ah-kim' : 'Ee-tiu', english);
  if (relative.gender === 'female') return named('Ko-tiu', english);
  const older = isOlder(relative, parent);
  if (older === null) return incomplete(english);
  return named(older ? 'Ah-um' : 'Ah-tsim', english);
}

function siblingInLaw(self: Person, relative: Person, person: Person) {
  const english = person.gender === 'male' ? 'Brother-in-law' : person.gender === 'female' ? 'Sister-in-law' : 'Sibling-in-law';
  const older = isOlder(relative, self);
  if (!relative.gender || older === null) return incomplete(english);
  if (!older) return englishOnly(english);
  return named(relative.gender === 'male' ? 'Aso' : 'Chi-hu', english);
}

// `steps` walks from the signed-in person to `person`: U is up to a parent, D down to a child, S across to a spouse.
// `path` holds everyone along that walk, after the signed-in person.
function describe(tree: TreeData, self: Person, steps: string, path: Person[]): Relation | null {
  const person = path[path.length - 1];
  const inEnglish = (male: string, female: string, neutral: string) =>
    byGender(person, englishOnly(male), englishOnly(female), neutral);

  switch (steps) {
    case 'U':
      return byGender(person, named('Apa', 'Father'), named('Abu', 'Mother'), 'Parent');
    case 'UU':
      return grandparent(path[0], person);
    case 'UUU':
      return byGender(person, named('Tai-kong', 'Great-grandfather'), named('Tai-ma', 'Great-grandmother'), 'Great-grandparent');
    case 'S':
      return byGender(person, named('Ang', 'Husband'), named('Bo', 'Wife'), 'Spouse');
    case 'D':
      return byGender(person, named('Hau-se', 'Son'), named('Cha-bo-kia', 'Daughter'), 'Child');
    case 'DD':
      return named('Sun', person.gender === 'male' ? 'Grandson' : person.gender === 'female' ? 'Granddaughter' : 'Grandchild');
    case 'DDD':
      return englishOnly('Great-grandchild');
    case 'UD':
      return sibling(tree, self, person);
    case 'UDD':
      return named('Sun-a', person.gender === 'male' ? 'Nephew' : person.gender === 'female' ? 'Niece' : 'Nephew or niece');
    case 'UDS':
      return siblingInLaw(self, path[1], person);
    case 'UUD':
      return auntOrUncle(path[0], person);
    case 'UUDS':
      return auntOrUncleByMarriage(path[0], path[2], person);
    case 'UUDD':
      return cousin(self, person);
    case 'UUDDD':
      return named('Sun-a', "Cousin's child");
    case 'UUUD':
      return inEnglish('Great-uncle', 'Great-aunt', 'Great-aunt or uncle');
    case 'US':
      return inEnglish('Stepfather', 'Stepmother', 'Step-parent');
    case 'SD':
      return inEnglish('Stepson', 'Stepdaughter', 'Stepchild');
    case 'USD':
      return inEnglish('Stepbrother', 'Stepsister', 'Step-sibling');
    case 'SU':
      return inEnglish('Father-in-law', 'Mother-in-law', 'Parent-in-law');
    case 'SUD':
      return inEnglish('Brother-in-law', 'Sister-in-law', 'Sibling-in-law');
    case 'DS':
      return inEnglish('Son-in-law', 'Daughter-in-law', 'Child-in-law');
    default:
      return null;
  }
}

// What each person is to selfId, by the shortest route through the tree. People too distant to name are left out.
export function relationsTo(tree: TreeData, selfId: string) {
  const peopleById = new Map(tree.people.map((person) => [person.id, person]));
  const self = peopleById.get(selfId);
  const relations = new Map<string, Relation>();
  if (!self) return relations;

  const neighbours = new Map<string, { id: string; step: string }[]>();
  const connect = (fromId: string, id: string, step: string) => {
    const list = neighbours.get(fromId) ?? [];
    list.push({ id, step });
    neighbours.set(fromId, list);
  };
  for (const { parentId, childId } of tree.parentChild) {
    connect(childId, parentId, 'U');
    connect(parentId, childId, 'D');
  }
  for (const { firstId, secondId } of tree.spouses) {
    connect(firstId, secondId, 'S');
    connect(secondId, firstId, 'S');
  }

  relations.set(selfId, englishOnly('You'));
  const seen = new Set([selfId]);
  const queue: { id: string; steps: string; path: Person[] }[] = [{ id: selfId, steps: '', path: [] }];
  for (const { id, steps, path } of queue) {
    for (const next of neighbours.get(id) ?? []) {
      const person = peopleById.get(next.id);
      if (!person || seen.has(next.id)) continue;
      seen.add(next.id);
      const nextSteps = steps + next.step;
      const nextPath = [...path, person];
      const relation = describe(tree, self, nextSteps, nextPath);
      if (relation) relations.set(next.id, relation);
      queue.push({ id: next.id, steps: nextSteps, path: nextPath });
    }
  }
  return relations;
}

export function relationText({ term, english }: Relation) {
  return term ? `${term} · ${english}` : english;
}

// Ignores case and accents, and splits on spaces and hyphens
function wordsIn(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean);
}

// Finds people by name, Chinese term or English relationship. Everything typed has to match the start of a word,
// because "ako" shouldn't find Guakong. A hyphenated term also counts as one word, so "ahko" finds Ah-ko.
export function searchPeople(people: Person[], relations: Map<string, Relation>, query: string) {
  const searched = wordsIn(query);
  if (searched.length === 0) return [];
  return people.filter((person) => {
    const relation = relations.get(person.id);
    const term = relation?.term ?? '';
    const text = `${person.fullName} ${term} ${ALSO_SPELLED[term] ?? ''} ${relation?.english ?? ''}`;
    const words = [...wordsIn(text), ...wordsIn(text.replaceAll('-', ''))];
    return searched.every((start) => words.some((word) => word.startsWith(start)));
  });
}
