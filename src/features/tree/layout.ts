import { type ParentChildLink } from './graph';

export const CARD_WIDTH = 160;
export const CARD_HEIGHT = 76;
const SPOUSE_GAP = 20;
const CLUSTER_GAP = 40;
const GENERATION_GAP = 80;
const COMPONENT_GAP = 80;
const REFINEMENT_PASSES = 2;

export type SpouseLink = { firstId: string; secondId: string };

export type TreeInput = {
  ids: string[];
  spouses: SpouseLink[];
  parentChild: ParentChildLink[];
};

export type PositionedPerson = { id: string; x: number; y: number; generation: number };

export type SpouseLine = {
  firstId: string;
  secondId: string;
  fromX: number;
  toX: number;
  y: number;
  // False when another card sits between the couple, so the line has to go over the top
  adjacent: boolean;
  overTop: { leftX: number; leftY: number; rightX: number; rightY: number };
};

export type FamilyLine = {
  parentIds: string[];
  originX: number;
  originY: number;
  busY: number;
  children: { id: string; x: number; y: number }[];
};

export type TreeLayout = {
  people: PositionedPerson[];
  spouseLines: SpouseLine[];
  familyLines: FamilyLine[];
  width: number;
  height: number;
};

type Cluster = { memberIds: string[]; width: number; x: number };

function push(map: Map<string, string[]>, key: string, value: string) {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

function assignGenerations(
  ids: string[],
  spousesOf: Map<string, string[]>,
  childrenOf: Map<string, string[]>,
  parentsOf: Map<string, string[]>
) {
  const generation = new Map<string, number>();
  const components: string[][] = [];

  for (const start of ids) {
    if (generation.has(start)) continue;
    const component: string[] = [];
    generation.set(start, 0);
    const queue = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      const level = generation.get(current)!;
      const neighbors: [string[] | undefined, number][] = [
        [spousesOf.get(current), level],
        [childrenOf.get(current), level + 1],
        [parentsOf.get(current), level - 1],
      ];
      for (const [people, nextLevel] of neighbors) {
        for (const person of people ?? []) {
          // The first generation assigned wins, which keeps relatives who married from looping forever
          if (generation.has(person)) continue;
          generation.set(person, nextLevel);
          queue.push(person);
        }
      }
    }

    const lowest = Math.min(...component.map((id) => generation.get(id)!));
    for (const id of component) generation.set(id, generation.get(id)! - lowest);
    components.push(component);
  }

  return { generation, components };
}

// Puts the most-married person in the middle, so each of their spouses can sit beside them
function orderCluster(memberIds: string[], spousesOf: Map<string, string[]>) {
  const members = new Set(memberIds);
  const spouseCount = (id: string) => (spousesOf.get(id) ?? []).filter((spouse) => members.has(spouse)).length;
  const hub = [...memberIds].sort((a, b) => spouseCount(b) - spouseCount(a) || a.localeCompare(b))[0];

  const placed = new Set([hub]);
  const walk = (id: string): string[] => {
    placed.add(id);
    const chain = [id];
    for (const spouse of spousesOf.get(id) ?? []) {
      if (members.has(spouse) && !placed.has(spouse)) chain.push(...walk(spouse));
    }
    return chain;
  };

  const order = [hub];
  let placeLeft = true;
  for (const spouse of spousesOf.get(hub) ?? []) {
    if (!members.has(spouse) || placed.has(spouse)) continue;
    const chain = walk(spouse);
    if (placeLeft) order.unshift(...chain.reverse());
    else order.push(...chain);
    placeLeft = !placeLeft;
  }
  return order;
}

function buildClusters(
  component: string[],
  generation: Map<string, number>,
  spousesOf: Map<string, string[]>
) {
  const seen = new Set<string>();
  const byGeneration = new Map<number, Cluster[]>();

  for (const id of component) {
    if (seen.has(id)) continue;
    const level = generation.get(id)!;
    const memberIds: string[] = [];
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      memberIds.push(current);
      for (const spouse of spousesOf.get(current) ?? []) {
        if (generation.get(spouse) === level) stack.push(spouse);
      }
    }
    const ordered = orderCluster(memberIds, spousesOf);
    const cluster: Cluster = {
      memberIds: ordered,
      width: ordered.length * CARD_WIDTH + (ordered.length - 1) * SPOUSE_GAP,
      x: 0,
    };
    const clusters = byGeneration.get(level);
    if (clusters) clusters.push(cluster);
    else byGeneration.set(level, [cluster]);
  }
  return byGeneration;
}

function layoutComponent(
  component: string[],
  generation: Map<string, number>,
  spousesOf: Map<string, string[]>,
  childrenOf: Map<string, string[]>,
  parentsOf: Map<string, string[]>
) {
  const byGeneration = buildClusters(component, generation, spousesOf);
  const levels = [...byGeneration.keys()].sort((a, b) => a - b);
  const centers = new Map<string, number>();

  const recordCenters = (cluster: Cluster) => {
    cluster.memberIds.forEach((id, index) => {
      centers.set(id, cluster.x + index * (CARD_WIDTH + SPOUSE_GAP) + CARD_WIDTH / 2);
    });
  };

  // The ideal cluster center, based on the average position of the given relatives
  const targetOf = (cluster: Cluster, relativesOf: Map<string, string[]>) => {
    const offsets: number[] = [];
    cluster.memberIds.forEach((id, index) => {
      const positions = (relativesOf.get(id) ?? [])
        .map((relative) => centers.get(relative))
        .filter((position): position is number => position !== undefined);
      if (positions.length === 0) return;
      const average = positions.reduce((sum, position) => sum + position, 0) / positions.length;
      // Line up this member, not the middle of the cluster, with their relatives
      const memberCenter = index * (CARD_WIDTH + SPOUSE_GAP) + CARD_WIDTH / 2;
      offsets.push(average - memberCenter + cluster.width / 2);
    });
    if (offsets.length === 0) return null;
    return offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
  };

  const placeLevel = (level: number, relativesOf: Map<string, string[]>, resort: boolean) => {
    const clusters = byGeneration.get(level)!;
    const targets = new Map(clusters.map((cluster) => [cluster, targetOf(cluster, relativesOf)]));
    if (resort) {
      // Stable sort, so clusters with no target stay next to the ones they started beside
      clusters.sort((a, b) => (targets.get(a) ?? Infinity) - (targets.get(b) ?? Infinity));
    }
    let cursor = -Infinity;
    for (const cluster of clusters) {
      const target = targets.get(cluster);
      const wanted = target === null || target === undefined ? cluster.x : target - cluster.width / 2;
      cluster.x = cursor === -Infinity ? wanted : Math.max(wanted, cursor);
      cursor = cluster.x + cluster.width + CLUSTER_GAP;
      recordCenters(cluster);
    }
  };

  // Lay each generation out side by side to get a starting position
  for (const level of levels) {
    let cursor = 0;
    for (const cluster of byGeneration.get(level)!) {
      cluster.x = cursor;
      cursor += cluster.width + CLUSTER_GAP;
      recordCenters(cluster);
    }
  }

  // Sweep down to sit children under parents, then up to center parents over children
  for (let pass = 0; pass < REFINEMENT_PASSES; pass += 1) {
    for (const level of levels.slice(1)) placeLevel(level, parentsOf, true);
    for (const level of [...levels].reverse().slice(1)) placeLevel(level, childrenOf, false);
  }
  for (const level of levels.slice(1)) placeLevel(level, parentsOf, true);

  const people: PositionedPerson[] = [];
  for (const level of levels) {
    for (const cluster of byGeneration.get(level)!) {
      for (const id of cluster.memberIds) {
        people.push({
          id,
          x: centers.get(id)! - CARD_WIDTH / 2,
          y: level * (CARD_HEIGHT + GENERATION_GAP),
          generation: level,
        });
      }
    }
  }

  const left = Math.min(...people.map((person) => person.x));
  for (const person of people) person.x -= left;
  const width = Math.max(...people.map((person) => person.x)) + CARD_WIDTH;
  return { people, width };
}

export function layoutTree({ ids, spouses, parentChild }: TreeInput): TreeLayout {
  const known = new Set(ids);
  const sortedIds = [...ids].sort();
  const spousesOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();

  const knownSpouses = spouses.filter(({ firstId, secondId }) => known.has(firstId) && known.has(secondId));
  const knownParents = parentChild.filter(({ parentId, childId }) => known.has(parentId) && known.has(childId));

  for (const { firstId, secondId } of knownSpouses) {
    push(spousesOf, firstId, secondId);
    push(spousesOf, secondId, firstId);
  }
  for (const { parentId, childId } of knownParents) {
    push(childrenOf, parentId, childId);
    push(parentsOf, childId, parentId);
  }
  for (const relatives of [spousesOf, childrenOf, parentsOf]) {
    for (const list of relatives.values()) list.sort();
  }

  const { generation, components } = assignGenerations(sortedIds, spousesOf, childrenOf, parentsOf);

  const people: PositionedPerson[] = [];
  let offset = 0;
  for (const component of components) {
    const result = layoutComponent(component, generation, spousesOf, childrenOf, parentsOf);
    for (const person of result.people) people.push({ ...person, x: person.x + offset });
    offset += result.width + COMPONENT_GAP;
  }

  const positions = new Map(people.map((person) => [person.id, person]));

  const spouseLines: SpouseLine[] = knownSpouses.map(({ firstId, secondId }) => {
    const first = positions.get(firstId)!;
    const second = positions.get(secondId)!;
    const [leftPerson, rightPerson] = first.x <= second.x ? [first, second] : [second, first];
    const sameRow = first.y === second.y;
    const between = sameRow
      ? people.some((person) => person.y === first.y && person.x > leftPerson.x && person.x < rightPerson.x)
      : false;
    return {
      firstId,
      secondId,
      fromX: leftPerson.x + (sameRow ? CARD_WIDTH : CARD_WIDTH / 2),
      toX: rightPerson.x + (sameRow ? 0 : CARD_WIDTH / 2),
      y: first.y + CARD_HEIGHT / 2,
      adjacent: sameRow && !between,
      overTop: {
        leftX: leftPerson.x + CARD_WIDTH / 2,
        leftY: leftPerson.y,
        rightX: rightPerson.x + CARD_WIDTH / 2,
        rightY: rightPerson.y,
      },
    };
  });

  // Children who share the same set of parents hang from one line, which keeps half-siblings apart
  const families = new Map<string, { parentIds: string[]; childIds: string[] }>();
  for (const [childId, parentIds] of parentsOf) {
    const key = parentIds.join('|');
    const family = families.get(key);
    if (family) family.childIds.push(childId);
    else families.set(key, { parentIds, childIds: [childId] });
  }

  const familyLines: FamilyLine[] = [...families.values()].map(({ parentIds, childIds }) => {
    const parents = parentIds.map((id) => positions.get(id)!);
    const originX = parents.reduce((sum, parent) => sum + parent.x + CARD_WIDTH / 2, 0) / parents.length;
    const originY = Math.max(...parents.map((parent) => parent.y)) + CARD_HEIGHT;
    return {
      parentIds,
      originX,
      originY,
      busY: originY + GENERATION_GAP / 2,
      children: childIds.map((id) => {
        const child = positions.get(id)!;
        return { id, x: child.x + CARD_WIDTH / 2, y: child.y };
      }),
    };
  });

  const width = people.length > 0 ? Math.max(...people.map((person) => person.x)) + CARD_WIDTH : 0;
  const height = people.length > 0 ? Math.max(...people.map((person) => person.y)) + CARD_HEIGHT : 0;

  return { people, spouseLines, familyLines, width, height };
}
