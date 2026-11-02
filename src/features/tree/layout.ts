import { type ParentChildLink } from './graph';
import { type Connection, routeConnections, type Span, type Terminal } from './routing';

export const CARD_WIDTH = 184;
export const CARD_HEIGHT = 84;
// Wide enough to leave room for the tap areas around each card
const SPOUSE_GAP = 32;
const CLUSTER_GAP = 48;
const GENERATION_GAP = 96;
const COMPONENT_GAP = 96;
// Keeps lines that slide along a card's edge away from its corners
const PIN_INSET = 16;

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
  // False when another card sits between the couple, so the line has to go around
  adjacent: boolean;
  paths: string[];
};

export type FamilyLine = {
  parentIds: string[];
  originX: number;
  originY: number;
  // Where the line down to the children starts. A couple sitting side by side start it from the line between them.
  stemY: number;
  busY: number;
  children: { id: string; x: number; y: number }[];
  paths: string[];
};

export type TreeLayout = {
  people: PositionedPerson[];
  spouseLines: SpouseLine[];
  familyLines: FamilyLine[];
  width: number;
  height: number;
};

type Cluster = { memberIds: string[]; width: number; level: number };

type Family = { parentIds: string[]; childIds: string[] };

// Clusters placed relative to each other, with each one's left edge
type Block = Map<Cluster, number>;

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

// Puts the most-married person in the middle, so each of their partners can sit beside them
function orderCluster(memberIds: string[], partnersOf: Map<string, string[]>) {
  const members = new Set(memberIds);
  const partnerCount = (id: string) => (partnersOf.get(id) ?? []).filter((partner) => members.has(partner)).length;
  const hub = [...memberIds].sort((a, b) => partnerCount(b) - partnerCount(a) || a.localeCompare(b))[0];

  const placed = new Set([hub]);
  const walk = (id: string): string[] => {
    placed.add(id);
    const chain = [id];
    for (const partner of partnersOf.get(id) ?? []) {
      if (members.has(partner) && !placed.has(partner)) chain.push(...walk(partner));
    }
    return chain;
  };

  const order = [hub];
  let placeLeft = true;
  for (const partner of partnersOf.get(hub) ?? []) {
    if (!members.has(partner) || placed.has(partner)) continue;
    const chain = walk(partner);
    if (placeLeft) order.unshift(...chain.reverse());
    else order.push(...chain);
    placeLeft = !placeLeft;
  }
  return order;
}

function buildClusters(component: string[], generation: Map<string, number>, partnersOf: Map<string, string[]>) {
  const seen = new Set<string>();
  const clusters: Cluster[] = [];

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
      for (const partner of partnersOf.get(current) ?? []) {
        if (generation.get(partner) === level) stack.push(partner);
      }
    }
    const ordered = orderCluster(memberIds, partnersOf);
    clusters.push({
      memberIds: ordered,
      width: ordered.length * CARD_WIDTH + (ordered.length - 1) * SPOUSE_GAP,
      level,
    });
  }
  return clusters;
}

function memberCenter(cluster: Cluster, id: string) {
  return cluster.memberIds.indexOf(id) * (CARD_WIDTH + SPOUSE_GAP) + CARD_WIDTH / 2;
}

function parentsWithin(family: Family, cluster: Cluster) {
  return family.parentIds.filter((id) => cluster.memberIds.includes(id));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function extentsOf(block: Block) {
  const extents = new Map<number, Span>();
  for (const [cluster, x] of block) {
    const extent = extents.get(cluster.level);
    const right = x + cluster.width;
    if (extent) {
      extent.left = Math.min(extent.left, x);
      extent.right = Math.max(extent.right, right);
    } else {
      extents.set(cluster.level, { left: x, right });
    }
  }
  return extents;
}

// Adds `block` to one side of `placed`, as close to `wanted` as it can get without the two interleaving
// on any row. Keeping whole branches apart is what stops the lines of different families from crossing.
function mergeBeside(
  placed: Block,
  block: Block,
  side: 'left' | 'right',
  wanted: number,
  reserved?: Span & { level: number }
) {
  const extents = extentsOf(placed);
  if (reserved) {
    const extent = extents.get(reserved.level);
    extents.set(reserved.level, {
      left: Math.min(extent?.left ?? reserved.left, reserved.left),
      right: Math.max(extent?.right ?? reserved.right, reserved.right),
    });
  }
  let shift = wanted;
  for (const [level, { left, right }] of extentsOf(block)) {
    const other = extents.get(level);
    if (!other) continue;
    shift =
      side === 'right'
        ? Math.max(shift, other.right + CLUSTER_GAP - left)
        : Math.min(shift, other.left - CLUSTER_GAP - right);
  }
  if (!Number.isFinite(shift)) shift = Math.max(...[...extents.values()].map((extent) => extent.right)) + CLUSTER_GAP;
  for (const [cluster, x] of block) placed.set(cluster, x + shift);
}

// The children's parents have to fit on their row, between whatever in-laws the children brought with them
function shiftClearOf(row: Block, cluster: Cluster, wanted: number) {
  const occupied = [...row]
    .filter(([other]) => other.level === cluster.level)
    .map(([other, x]) => ({ left: x, right: x + other.width }));
  const isClear = (shift: number) =>
    occupied.every(
      ({ left, right }) => left + shift >= cluster.width + CLUSTER_GAP || right + shift <= -CLUSTER_GAP
    );
  const options = [
    wanted,
    ...occupied.flatMap(({ left, right }) => [cluster.width + CLUSTER_GAP - left, -CLUSTER_GAP - right]),
  ].filter(isClear);
  return options.reduce((best, shift) => (Math.abs(shift - wanted) < Math.abs(best - wanted) ? shift : best), options[0]);
}

function descendantCount(cluster: Cluster, childrenOf: Map<string, string[]>) {
  const seen = new Set<string>();
  const stack = cluster.memberIds.flatMap((id) => childrenOf.get(id) ?? []);
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(childrenOf.get(current) ?? []));
  }
  return seen.size;
}

function layoutComponent(
  component: string[],
  generation: Map<string, number>,
  partnersOf: Map<string, string[]>,
  childrenOf: Map<string, string[]>,
  parentsOf: Map<string, string[]>,
  families: Family[]
) {
  const clusters = buildClusters(component, generation, partnersOf);
  const clusterOf = new Map(clusters.flatMap((cluster) => cluster.memberIds.map((id) => [id, cluster] as const)));
  const placedClusters = new Set<Cluster>();

  const familiesFrom = (cluster: Cluster) => {
    const origin = (family: Family) => mean(parentsWithin(family, cluster).map((id) => memberCenter(cluster, id)));
    return families
      .filter((family) => parentsWithin(family, cluster).length > 0)
      .sort((a, b) => origin(a) - origin(b));
  };

  // Someone whose own parents still have to be placed pulls their side of the tree toward them, so they go on the outside
  const unplacedParentsOf = (id: string) =>
    (parentsOf.get(id) ?? []).some((parent) => !placedClusters.has(clusterOf.get(parent)!));

  const orderChildren = (family: Family) => {
    const children = [...new Set(family.childIds.map((id) => clusterOf.get(id)).filter((c) => c !== undefined))];
    const hasInLaw = (child: Cluster) =>
      child.memberIds.some((id) => !family.childIds.includes(id) && unplacedParentsOf(id));
    const withInLaws = children.filter(hasInLaw);
    const left = withInLaws.filter((_, index) => index % 2 === 1);
    const right = withInLaws.filter((_, index) => index % 2 === 0);

    const faceOutward = (child: Cluster, side: 'left' | 'right') => {
      const inLawIndex = child.memberIds.findIndex((id) => !family.childIds.includes(id) && unplacedParentsOf(id));
      const blood = child.memberIds.findIndex((id) => family.childIds.includes(id));
      if (side === 'left' ? inLawIndex > blood : inLawIndex < blood) child.memberIds.reverse();
    };
    left.forEach((child) => faceOutward(child, 'left'));
    right.forEach((child) => faceOutward(child, 'right'));

    return [...left, ...children.filter((child) => !hasInLaw(child)), ...right];
  };

  const place = (cluster: Cluster, reserved?: Span & { level: number }): Block => {
    const block: Block = new Map([[cluster, 0]]);

    // Children first, side by side, with their parents centered over them
    const row: Block = new Map();
    const childFamilies = familiesFrom(cluster);
    for (const family of childFamilies) {
      for (const child of orderChildren(family)) {
        if (placedClusters.has(child)) continue;
        placedClusters.add(child);
        const blood = child.memberIds.find((id) => family.childIds.includes(id))!;
        const pin = memberCenter(child, blood);
        // Hold the space where this cluster's parents will go, so in-laws don't take it
        const childBlock = place(child, {
          level: cluster.level,
          left: pin - cluster.width / 2,
          right: pin + cluster.width / 2,
        });
        if (row.size === 0) for (const [other, x] of childBlock) row.set(other, x);
        else mergeBeside(row, childBlock, 'right', -Infinity);
      }
    }
    if (row.size > 0) {
      const offsets = childFamilies.flatMap((family) => {
        const pins = family.childIds
          .filter((id) => row.has(clusterOf.get(id)!))
          .map((id) => row.get(clusterOf.get(id)!)! + memberCenter(clusterOf.get(id)!, id));
        if (pins.length === 0) return [];
        const origin = mean(parentsWithin(family, cluster).map((id) => memberCenter(cluster, id)));
        return [origin - (Math.min(...pins) + Math.max(...pins)) / 2];
      });
      const shift = shiftClearOf(row, cluster, offsets.length > 0 ? mean(offsets) : 0);
      for (const [other, x] of row) block.set(other, x + shift);
    }

    // Then the parents of anyone who married in, on the side that person sits
    cluster.memberIds.forEach((id, index) => {
      const parents = parentsOf.get(id) ?? [];
      for (const parent of parents) {
        const parentCluster = clusterOf.get(parent);
        if (!parentCluster || placedClusters.has(parentCluster)) continue;
        placedClusters.add(parentCluster);
        const parentBlock = place(parentCluster);
        const origin = mean(
          parents.filter((other) => parentCluster.memberIds.includes(other)).map((other) => memberCenter(parentCluster, other))
        );
        const side = index * 2 < cluster.memberIds.length - 1 ? 'left' : 'right';
        mergeBeside(block, parentBlock, side, memberCenter(cluster, id) - origin, reserved);
      }
    });

    return block;
  };

  // Start from the branch with the most descendants, so everything else hangs off the family's main line
  const counts = new Map(clusters.map((cluster) => [cluster, descendantCount(cluster, childrenOf)]));
  const roots = [...clusters].sort(
    (a, b) => counts.get(b)! - counts.get(a)! || a.memberIds[0].localeCompare(b.memberIds[0])
  );

  const placed: Block = new Map();
  for (const root of roots) {
    if (placedClusters.has(root)) continue;
    placedClusters.add(root);
    const block = place(root);
    if (placed.size === 0) for (const [other, x] of block) placed.set(other, x);
    else mergeBeside(placed, block, 'right', -Infinity);
  }

  const people: PositionedPerson[] = [];
  for (const [cluster, x] of placed) {
    for (const id of cluster.memberIds) {
      people.push({ id, x: x + memberCenter(cluster, id) - CARD_WIDTH / 2, y: 0, generation: cluster.level });
    }
  }

  const left = Math.min(...people.map((person) => person.x));
  for (const person of people) person.x -= left;
  const width = Math.max(...people.map((person) => person.x)) + CARD_WIDTH;
  return { people, width };
}

// A row's cards, with the cards of a cluster joined together because the lines between them can't be crossed
function rowObstaclesOf(people: PositionedPerson[]) {
  const rowCount = Math.max(-1, ...people.map((person) => person.generation)) + 1;
  const rows: Span[][] = Array.from({ length: rowCount }, () => []);
  for (const person of [...people].sort((a, b) => a.x - b.x)) {
    const row = rows[person.generation];
    const last = row[row.length - 1];
    if (last && person.x - last.right <= SPOUSE_GAP) last.right = person.x + CARD_WIDTH;
    else row.push({ left: person.x, right: person.x + CARD_WIDTH });
  }
  return rows;
}

function cardTerminal(person: PositionedPerson, edge: 'top' | 'bottom'): Terminal {
  return {
    channel: edge === 'top' ? person.generation : person.generation + 1,
    leaves: edge === 'top' ? 'down' : 'up',
    x: person.x + CARD_WIDTH / 2,
    minX: person.x + PIN_INSET,
    maxX: person.x + CARD_WIDTH - PIN_INSET,
    reach: 0,
  };
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

  // Children who share the same set of parents hang from one line, which keeps half-siblings apart
  const familiesByKey = new Map<string, Family>();
  for (const childId of [...parentsOf.keys()].sort()) {
    const parentIds = parentsOf.get(childId)!;
    const key = parentIds.join('|');
    const family = familiesByKey.get(key);
    if (family) family.childIds.push(childId);
    else familiesByKey.set(key, { parentIds, childIds: [childId] });
  }
  const families = [...familiesByKey.values()];

  // Parents of the same child sit together even when they aren't listed as spouses. Spouses come first, so they sit closest.
  const partnersOf = new Map([...spousesOf].map(([id, list]) => [id, [...list]]));
  for (const { parentIds } of families) {
    for (const parent of parentIds) {
      for (const other of parentIds) {
        if (parent !== other && !partnersOf.get(parent)?.includes(other)) push(partnersOf, parent, other);
      }
    }
  }

  const { generation, components } = assignGenerations(sortedIds, spousesOf, childrenOf, parentsOf);

  const people: PositionedPerson[] = [];
  let offset = 0;
  for (const component of components) {
    const result = layoutComponent(component, generation, partnersOf, childrenOf, parentsOf, families);
    for (const person of result.people) people.push({ ...person, x: person.x + offset });
    offset += result.width + COMPONENT_GAP;
  }

  const positions = new Map(people.map((person) => [person.id, person]));

  const adjacentCouples = knownSpouses.filter(({ firstId, secondId }) => {
    const first = positions.get(firstId)!;
    const second = positions.get(secondId)!;
    if (first.generation !== second.generation) return false;
    const [from, to] = first.x <= second.x ? [first.x, second.x] : [second.x, first.x];
    return !people.some((person) => person.generation === first.generation && person.x > from && person.x < to);
  });
  const isAdjacentCouple = (a: string, b: string) =>
    adjacentCouples.some(
      ({ firstId, secondId }) => (firstId === a && secondId === b) || (firstId === b && secondId === a)
    );

  // Couples sitting side by side are joined by a plain line, so only the others need routing
  const routedSpouses = knownSpouses.filter(({ firstId, secondId }) => !isAdjacentCouple(firstId, secondId));
  const spouseConnections: Connection[] = routedSpouses.map(({ firstId, secondId }) => {
    const first = positions.get(firstId)!;
    const second = positions.get(secondId)!;
    if (first.generation === second.generation) {
      return { terminals: [cardTerminal(first, 'top'), cardTerminal(second, 'top')], mainChannel: first.generation };
    }
    const [upper, lower] = first.generation < second.generation ? [first, second] : [second, first];
    return { terminals: [cardTerminal(upper, 'bottom'), cardTerminal(lower, 'top')], mainChannel: upper.generation + 1 };
  });

  const isCouple = ({ parentIds }: Family) =>
    parentIds.length === 2 && isAdjacentCouple(parentIds[0], parentIds[1]);

  const familyConnections: Connection[] = families.map((family) => {
    const parents = family.parentIds.map((id) => positions.get(id)!);
    const childTerminals = family.childIds.map((id) => cardTerminal(positions.get(id)!, 'top'));
    const mainChannel = Math.max(...parents.map((parent) => parent.generation)) + 1;
    if (isCouple(family)) {
      const x = mean(parents.map((parent) => parent.x + CARD_WIDTH / 2));
      const stem: Terminal = { channel: mainChannel, leaves: 'up', x, minX: x, maxX: x, reach: CARD_HEIGHT / 2 };
      return { terminals: [stem, ...childTerminals], mainChannel };
    }
    return { terminals: [...parents.map((parent) => cardTerminal(parent, 'bottom')), ...childTerminals], mainChannel };
  });

  const { routes, rowTops, height } = routeConnections({
    connections: [...spouseConnections, ...familyConnections],
    rowObstacles: rowObstaclesOf(people),
    rowHeight: CARD_HEIGHT,
    minChannelHeight: GENERATION_GAP,
  });
  for (const person of people) person.y = rowTops[person.generation];

  const spouseLines: SpouseLine[] = knownSpouses.map(({ firstId, secondId }) => {
    const first = positions.get(firstId)!;
    const second = positions.get(secondId)!;
    const [leftPerson, rightPerson] = first.x <= second.x ? [first, second] : [second, first];
    const sameRow = first.y === second.y;
    const adjacent = isAdjacentCouple(firstId, secondId);
    const fromX = leftPerson.x + (sameRow ? CARD_WIDTH : CARD_WIDTH / 2);
    const toX = rightPerson.x + (sameRow ? 0 : CARD_WIDTH / 2);
    const y = first.y + CARD_HEIGHT / 2;
    const routedIndex = routedSpouses.findIndex((spouse) => spouse.firstId === firstId && spouse.secondId === secondId);
    return {
      firstId,
      secondId,
      fromX,
      toX,
      y,
      adjacent,
      paths: adjacent ? [`M ${fromX} ${y} L ${toX} ${y}`] : routes[routedIndex].paths,
    };
  });

  const familyLines: FamilyLine[] = families.map((family, index) => {
    const parents = family.parentIds.map((id) => positions.get(id)!);
    const originX = mean(parents.map((parent) => parent.x + CARD_WIDTH / 2));
    const originY = Math.max(...parents.map((parent) => parent.y)) + CARD_HEIGHT;
    const route = routes[routedSpouses.length + index];
    return {
      parentIds: family.parentIds,
      originX,
      originY,
      stemY: isCouple(family) ? originY - CARD_HEIGHT / 2 : originY,
      busY: route.laneY,
      children: family.childIds.map((id) => {
        const child = positions.get(id)!;
        return { id, x: child.x + CARD_WIDTH / 2, y: child.y };
      }),
      paths: route.paths,
    };
  });

  const width = people.length > 0 ? Math.max(...people.map((person) => person.x)) + CARD_WIDTH : 0;

  return { people, spouseLines, familyLines, width, height };
}
