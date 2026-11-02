import { wouldCreateCycle } from '@/features/tree/graph';
import { CARD_HEIGHT, CARD_WIDTH, layoutTree, type TreeInput, type TreeLayout } from '@/features/tree/layout';
import { routeConnections, type Terminal } from '@/features/tree/routing';

function positions(input: TreeInput) {
  const layout = layoutTree(input);
  return { layout, at: new Map(layout.people.map((person) => [person.id, person])) };
}

type Segment = { x1: number; y1: number; x2: number; y2: number };

function segmentsOf(path: string): Segment[] {
  return path
    .split('M')
    .filter((part) => part.trim())
    .flatMap((part) => {
      const numbers = part.match(/-?\d+(\.\d+)?/g)!.map(Number);
      const segments: Segment[] = [];
      for (let i = 0; i + 3 < numbers.length; i += 2) {
        const [x1, y1, x2, y2] = numbers.slice(i, i + 4);
        if (x1 === x2 && y1 === y2) continue;
        segments.push({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) });
      }
      return segments;
    });
}

function lineCollisions(layout: TreeLayout) {
  const owned = [
    ...layout.spouseLines.map((line) => ({ couple: [line.firstId, line.secondId].sort().join('|'), paths: line.paths })),
    ...layout.familyLines.map((line) => ({ couple: [...line.parentIds].sort().join('|'), paths: line.paths })),
  ].flatMap(({ couple, paths }, owner) => paths.flatMap(segmentsOf).map((segment) => ({ ...segment, owner, couple })));

  let overlaps = 0;
  let tooClose = 0;
  let crossings = 0;
  owned.forEach((a, index) => {
    for (const b of owned.slice(index + 1)) {
      if (a.owner === b.owner) continue;
      const aFlat = a.y1 === a.y2;
      const bFlat = b.y1 === b.y2;
      if (aFlat === bFlat) {
        const shared = aFlat ? Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) : Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        const apart = aFlat ? Math.abs(a.y1 - b.y1) : Math.abs(a.x1 - b.x1);
        if (shared > 0 && apart === 0) overlaps += 1;
        else if (shared > 0 && apart < 6) tooClose += 1;
      } else {
        const [flat, upright] = aFlat ? [a, b] : [b, a];
        const meets = upright.x1 >= flat.x1 && upright.x1 <= flat.x2 && flat.y1 >= upright.y1 && flat.y1 <= upright.y2;
        // A couple's line down to their children is meant to start on the line between them
        if (meets && a.couple !== b.couple) crossings += 1;
      }
    }
  });

  const behindCards = owned.filter((segment) =>
    layout.people.some(
      (person) =>
        segment.x2 > person.x &&
        segment.x1 < person.x + CARD_WIDTH &&
        segment.y2 > person.y &&
        segment.y1 < person.y + CARD_HEIGHT
    )
  ).length;

  return { overlaps, tooClose, crossings, behindCards };
}

type TreeShape = 'descendants' | 'remarriages' | 'inLaws' | 'relativesMarrying';

// A repeatable family, so a failure here can be replayed from its seed
function generateTree(shape: TreeShape, seed: number, size: number): TreeInput {
  let state = seed * 7919 + 13;
  const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  const ids: string[] = [];
  const spouses: TreeInput['spouses'] = [];
  const parentChild: TreeInput['parentChild'] = [];

  const person = () => {
    // Ids sort in a random order, like real ones do
    const id = `${Math.floor(random() * 0xffffff).toString(16).padStart(6, '0')}-${ids.length}`;
    ids.push(id);
    return id;
  };
  const marry = (firstId: string, secondId: string) => spouses.push({ firstId, secondId });
  const haveChildren = (parents: string[], count: number) =>
    Array.from({ length: count }, () => {
      const childId = person();
      for (const parentId of parents) parentChild.push({ parentId, childId });
      return childId;
    });

  const founder = person();
  const founderSpouse = person();
  marry(founder, founderSpouse);
  const queue = [[founder, founderSpouse]];
  while (ids.length < size && queue.length > 0) {
    const parents = queue.shift()!;
    const children = haveChildren(parents, 1 + Math.floor(random() * 4));
    if (shape !== 'descendants' && random() < 0.25) {
      const secondSpouse = person();
      marry(parents[0], secondSpouse);
      children.push(...haveChildren([parents[0], secondSpouse], 1 + Math.floor(random() * 3)));
    }
    for (const child of children) {
      if (random() < 0.35) continue;
      const spouse = person();
      marry(child, spouse);
      if ((shape === 'inLaws' || shape === 'relativesMarrying') && random() < 0.4) {
        const inLaw1 = person();
        const inLaw2 = person();
        marry(inLaw1, inLaw2);
        parentChild.push({ parentId: inLaw1, childId: spouse }, { parentId: inLaw2, childId: spouse });
        haveChildren([inLaw1, inLaw2], Math.floor(random() * 3));
      }
      queue.push([child, spouse]);
    }
  }
  if (shape === 'relativesMarrying') {
    const single = ids.filter((id) => !spouses.some((link) => link.firstId === id || link.secondId === id));
    for (let i = 0; i + 1 < Math.min(single.length, 4); i += 2) marry(single[i], single[single.length - 1 - i]);
  }
  return { ids, spouses: spouses.filter((link) => link.firstId !== link.secondId), parentChild };
}

function center(person: { x: number } | undefined) {
  return person!.x + CARD_WIDTH / 2;
}

function expectNoOverlaps(input: TreeInput) {
  const { layout } = positions(input);
  for (const a of layout.people) {
    for (const b of layout.people) {
      if (a.id !== b.id && a.y === b.y) {
        expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(CARD_WIDTH);
      }
    }
  }
}

describe('adoption by a great uncle', () => {
  const links: TreeInput['parentChild'] = [
    { parentId: 'ancestor', childId: 'uncle' },
    { parentId: 'ancestor', childId: 'grandparent' },
    { parentId: 'grandparent', childId: 'father' },
    { parentId: 'father', childId: 'adoptee' },
    { parentId: 'mother', childId: 'adoptee' },
    { parentId: 'uncle', childId: 'adoptee', kind: 'adoptive' },
    { parentId: 'adoptee', childId: 'descendant' },
  ];
  const names = ['ancestor', 'uncle', 'grandparent', 'father', 'mother', 'adoptee', 'descendant'];
  const spouses = [{ firstId: 'father', secondId: 'mother' }];

  // Real ids are random, and the result must not depend on how they happen to sort
  const everyOrdering = names.map((_, rotation) => (id: string) => `${(names.indexOf(id) + rotation) % names.length}-${id}`);

  it.each(everyOrdering.map((rename, rotation) => [rotation, rename] as const))(
    'keeps everyone on their row with id ordering %i',
    (_, rename) => {
      const { at } = positions({
        ids: names.map(rename),
        spouses: spouses.map(({ firstId, secondId }) => ({ firstId: rename(firstId), secondId: rename(secondId) })),
        parentChild: links.map((link) => ({ ...link, parentId: rename(link.parentId), childId: rename(link.childId) })),
      });
      const row = (id: string) => at.get(rename(id))!.generation;
      expect(row('uncle')).toBe(row('ancestor') + 1);
      expect(row('grandparent')).toBe(row('uncle'));
      expect(row('adoptee')).toBe(row('uncle') + 1);
      expect(row('father')).toBe(row('grandparent') + 1);
      expect(row('mother')).toBe(row('father'));
      expect(row('descendant')).toBe(row('adoptee') + 1);
    }
  );

  it('draws the adoptive parent solid and the birth parents dashed', () => {
    const { layout } = positions({ ids: names, spouses, parentChild: links });
    expect(layout.familyLines.find((line) => line.children.some(({ id }) => id === 'adoptee'))!.parentIds).toEqual(['uncle']);
    expect(layout.birthLines).toHaveLength(1);
    expect(layout.birthLines[0]).toMatchObject({ parentIds: ['father', 'mother'], childIds: ['adoptee'] });
    expect(layout.birthLines[0].paths.length).toBeGreaterThan(0);
  });

  it('keeps every line clear of the cards', () => {
    const { layout } = positions({ ids: names, spouses, parentChild: links });
    const clear = (line: { paths: string[] }) =>
      line.paths.flatMap(segmentsOf).every((segment) =>
        layout.people.every(
          (person) =>
            segment.x2 <= person.x ||
            segment.x1 >= person.x + CARD_WIDTH ||
            segment.y2 <= person.y ||
            segment.y1 >= person.y + CARD_HEIGHT
        )
      );
    expect([...layout.familyLines, ...layout.birthLines].every(clear)).toBe(true);
    expect(lineCollisions(layout).overlaps).toBe(0);
  });

  it('places birth parents known only through the adopted person one row above them', () => {
    const { at, layout } = positions({
      ids: ['uncle', 'adoptee', 'father', 'mother'],
      spouses: [],
      parentChild: [
        { parentId: 'uncle', childId: 'adoptee', kind: 'adoptive' },
        { parentId: 'father', childId: 'adoptee' },
        { parentId: 'mother', childId: 'adoptee' },
      ],
    });
    expect(at.get('father')!.generation).toBe(at.get('adoptee')!.generation - 1);
    expect(at.get('mother')!.generation).toBe(at.get('father')!.generation);
    expect(layout.birthLines).toHaveLength(1);
  });

  it('draws no dashed lines when nobody is adopted', () => {
    const { layout } = positions({
      ids: ['mom', 'kid'],
      spouses: [],
      parentChild: [{ parentId: 'mom', childId: 'kid', kind: 'birth' }],
    });
    expect(layout.birthLines).toEqual([]);
    expect(layout.familyLines).toHaveLength(1);
  });
});

describe('layoutTree', () => {
  it('returns an empty layout for an empty tree', () => {
    expect(layoutTree({ ids: [], spouses: [], parentChild: [] })).toMatchObject({ people: [], width: 0, height: 0 });
  });

  it('places a child below parents and centered under the couple', () => {
    const { at } = positions({
      ids: ['mom', 'dad', 'kid'],
      spouses: [{ firstId: 'dad', secondId: 'mom' }],
      parentChild: [
        { parentId: 'mom', childId: 'kid' },
        { parentId: 'dad', childId: 'kid' },
      ],
    });
    expect(at.get('mom')!.y).toBe(at.get('dad')!.y);
    expect(at.get('kid')!.y).toBeGreaterThan(at.get('mom')!.y);
    expect(center(at.get('kid'))).toBeCloseTo((center(at.get('mom')) + center(at.get('dad'))) / 2);
  });

  it('starts the line to the children from the line between a couple', () => {
    const { layout } = positions({
      ids: ['mom', 'dad', 'kid'],
      spouses: [{ firstId: 'dad', secondId: 'mom' }],
      parentChild: [
        { parentId: 'mom', childId: 'kid' },
        { parentId: 'dad', childId: 'kid' },
      ],
    });
    expect(layout.familyLines[0].stemY).toBe(layout.spouseLines[0].y);
  });

  it('starts the line to the children from the card when there is no couple', () => {
    const { layout } = positions({
      ids: ['solo', 'kid', 'p1', 'p2', 'kid2'],
      spouses: [],
      parentChild: [
        { parentId: 'solo', childId: 'kid' },
        { parentId: 'p1', childId: 'kid2' },
        { parentId: 'p2', childId: 'kid2' },
      ],
    });
    for (const family of layout.familyLines) expect(family.stemY).toBe(family.originY);
  });

  it('seats a person with two spouses between them', () => {
    const { at, layout } = positions({
      ids: ['hub', 'spouse1', 'spouse2'],
      spouses: [
        { firstId: 'hub', secondId: 'spouse1' },
        { firstId: 'hub', secondId: 'spouse2' },
      ],
      parentChild: [],
    });
    const [left, right] = [at.get('spouse1')!.x, at.get('spouse2')!.x].sort((a, b) => a - b);
    expect(at.get('hub')!.x).toBeGreaterThan(left);
    expect(at.get('hub')!.x).toBeLessThan(right);
    expect(layout.spouseLines.every((line) => line.adjacent)).toBe(true);
  });

  it('draws over the top when three spouses mean one cannot sit beside the hub', () => {
    const { layout } = positions({
      ids: ['hub', 's1', 's2', 's3'],
      spouses: [
        { firstId: 'hub', secondId: 's1' },
        { firstId: 'hub', secondId: 's2' },
        { firstId: 'hub', secondId: 's3' },
      ],
      parentChild: [],
    });
    expect(layout.spouseLines.filter((line) => !line.adjacent)).toHaveLength(1);
  });

  it('keeps half-siblings under the couple they belong to', () => {
    const input: TreeInput = {
      ids: ['hub', 'spouse1', 'spouse2', 'child1', 'child2'],
      spouses: [
        { firstId: 'hub', secondId: 'spouse1' },
        { firstId: 'hub', secondId: 'spouse2' },
      ],
      parentChild: [
        { parentId: 'hub', childId: 'child1' },
        { parentId: 'spouse1', childId: 'child1' },
        { parentId: 'hub', childId: 'child2' },
        { parentId: 'spouse2', childId: 'child2' },
      ],
    };
    const { at, layout } = positions(input);
    expect(layout.familyLines).toHaveLength(2);

    const spouse1IsLeft = at.get('spouse1')!.x < at.get('spouse2')!.x;
    const child1IsLeft = at.get('child1')!.x < at.get('child2')!.x;
    expect(child1IsLeft).toBe(spouse1IsLeft);
    expectNoOverlaps(input);
  });

  it('gives half-sibling families separate lines when their lines would overlap', () => {
    const bigFamily = ['a', 'b', 'c', 'd', 'e'];
    const { layout } = positions({
      ids: ['hub', 'spouse1', 'spouse2', ...bigFamily, 'f'],
      spouses: [
        { firstId: 'hub', secondId: 'spouse1' },
        { firstId: 'hub', secondId: 'spouse2' },
      ],
      parentChild: [
        ...bigFamily.flatMap((childId) => [
          { parentId: 'hub', childId },
          { parentId: 'spouse1', childId },
        ]),
        { parentId: 'hub', childId: 'f' },
        { parentId: 'spouse2', childId: 'f' },
      ],
    });
    const [first, second] = layout.familyLines;
    expect(first.busY).not.toBe(second.busY);
    for (const family of layout.familyLines) {
      expect(family.busY).toBeGreaterThan(family.originY);
      expect(family.busY).toBeLessThan(Math.min(...family.children.map((child) => child.y)));
    }
    expect(lineCollisions(layout).crossings).toBe(0);
  });

  it('never runs the lines of different families along each other, however big the tree gets', () => {
    for (const shape of ['descendants', 'remarriages', 'inLaws', 'relativesMarrying'] as const) {
      for (let seed = 1; seed <= 15; seed += 1) {
        for (const size of [20, 60, 120]) {
          const { overlaps, tooClose } = lineCollisions(layoutTree(generateTree(shape, seed, size)));
          expect({ shape, seed, size, overlaps, tooClose }).toEqual({ shape, seed, size, overlaps: 0, tooClose: 0 });
        }
      }
    }
  });

  it('never runs a line behind a card', () => {
    for (const shape of ['inLaws', 'relativesMarrying'] as const) {
      for (let seed = 1; seed <= 15; seed += 1) {
        expect(lineCollisions(layoutTree(generateTree(shape, seed, 80))).behindCards).toBe(0);
      }
    }
  });

  it('keeps every line uncrossed when no two branches have to meet', () => {
    for (const shape of ['descendants', 'remarriages'] as const) {
      for (let seed = 1; seed <= 15; seed += 1) {
        expect(lineCollisions(layoutTree(generateTree(shape, seed, 120))).crossings).toBe(0);
      }
    }
  });

  it('gives each line around a card its own height and keeps it off the line from their parents', () => {
    const spouses = ['s1', 's2', 's3', 's4', 's5'];
    const { layout } = positions({
      ids: ['grandparent', 'hub', ...spouses],
      spouses: spouses.map((secondId) => ({ firstId: 'hub', secondId })),
      parentChild: [{ parentId: 'grandparent', childId: 'hub' }],
    });
    expect(layout.spouseLines.filter((line) => !line.adjacent)).toHaveLength(3);
    expect(lineCollisions(layout).overlaps).toBe(0);
    expect(lineCollisions(layout).tooClose).toBe(0);
  });

  it('joins a line to both parents when they are not listed as a couple', () => {
    const { at, layout } = positions({
      ids: ['p1', 'p2', 'kid'],
      spouses: [],
      parentChild: [
        { parentId: 'p1', childId: 'kid' },
        { parentId: 'p2', childId: 'kid' },
      ],
    });
    expect(Math.abs(at.get('p1')!.x - at.get('p2')!.x)).toBe(CARD_WIDTH + 32);
    const segments = layout.familyLines[0].paths.flatMap(segmentsOf);
    for (const parent of [at.get('p1')!, at.get('p2')!]) {
      const bottom = parent.y + CARD_HEIGHT;
      expect(
        segments.some((s) => s.y1 === bottom && s.x1 > parent.x && s.x1 < parent.x + CARD_WIDTH)
      ).toBe(true);
    }
  });

  it('draws everyone when relatives link back into the same branch', () => {
    const tree = generateTree('relativesMarrying', 3, 60);
    const layout = layoutTree(tree);
    expect(layout.people).toHaveLength(tree.ids.length);
    expect(layout.familyLines.flatMap((family) => family.children)).toHaveLength(
      new Set(tree.parentChild.map((link) => link.childId)).size
    );
  });

  it('copes with parent links that loop', () => {
    const layout = layoutTree({
      ids: ['a', 'b', 'c'],
      spouses: [],
      parentChild: [
        { parentId: 'a', childId: 'b' },
        { parentId: 'b', childId: 'a' },
        { parentId: 'b', childId: 'c' },
      ],
    });
    expect(layout.people).toHaveLength(3);
    for (const line of layout.familyLines) expect(line.paths.join(' ')).not.toContain('NaN');
  });

  it('lets families that do not overlap share a line height', () => {
    const { layout } = positions({
      ids: ['p1', 'c1', 'p2', 'c2'],
      spouses: [],
      parentChild: [
        { parentId: 'p1', childId: 'c1' },
        { parentId: 'p2', childId: 'c2' },
      ],
    });
    expect(layout.familyLines[0].busY).toBe(layout.familyLines[1].busY);
  });

  it('shows relatives who married once each and still draws every line', () => {
    const input: TreeInput = {
      ids: ['grandma', 'uncle', 'mom', 'cousin', 'me', 'kid'],
      spouses: [{ firstId: 'cousin', secondId: 'me' }],
      parentChild: [
        { parentId: 'grandma', childId: 'uncle' },
        { parentId: 'grandma', childId: 'mom' },
        { parentId: 'uncle', childId: 'cousin' },
        { parentId: 'mom', childId: 'me' },
        { parentId: 'cousin', childId: 'kid' },
        { parentId: 'me', childId: 'kid' },
      ],
    };
    const { layout } = positions(input);
    expect(new Set(layout.people.map((person) => person.id)).size).toBe(input.ids.length);
    expect(layout.people).toHaveLength(input.ids.length);
    expect(layout.spouseLines).toHaveLength(1);
    expect(layout.familyLines.flatMap((family) => family.children)).toHaveLength(5);
    expectNoOverlaps(input);
  });

  it('terminates and places everyone when a marriage crosses generations', () => {
    const { layout } = positions({
      ids: ['grandpa', 'parent', 'child'],
      spouses: [{ firstId: 'grandpa', secondId: 'child' }],
      parentChild: [
        { parentId: 'grandpa', childId: 'parent' },
        { parentId: 'parent', childId: 'child' },
      ],
    });
    expect(layout.people).toHaveLength(3);
    expect(new Set(layout.people.map((person) => person.id)).size).toBe(3);
    expect(layout.spouseLines).toHaveLength(1);
    expect(layout.familyLines.flatMap((family) => family.children)).toHaveLength(2);
  });

  it('keeps unconnected family branches from overlapping', () => {
    const input: TreeInput = { ids: ['a', 'b', 'c'], spouses: [], parentChild: [] };
    expectNoOverlaps(input);
    expect(layoutTree(input).people).toHaveLength(3);
  });

  it('ignores relationships to people who are not in the tree', () => {
    const { layout } = positions({
      ids: ['a'],
      spouses: [{ firstId: 'a', secondId: 'pending' }],
      parentChild: [{ parentId: 'pending', childId: 'a' }],
    });
    expect(layout.spouseLines).toHaveLength(0);
    expect(layout.familyLines).toHaveLength(0);
  });

  it('never positions anyone at a negative x', () => {
    const { layout } = positions({
      ids: ['a', 'b', 'c', 'd', 'e', 'f'],
      spouses: [{ firstId: 'a', secondId: 'b' }],
      parentChild: [
        { parentId: 'a', childId: 'c' },
        { parentId: 'a', childId: 'd' },
        { parentId: 'a', childId: 'e' },
        { parentId: 'a', childId: 'f' },
      ],
    });
    expect(Math.min(...layout.people.map((person) => person.x))).toBeGreaterThanOrEqual(0);
  });
});

describe('routeConnections', () => {
  const top = (x: number): Terminal => ({ channel: 1, leaves: 'up', x, minX: x, maxX: x, reach: 0 });
  const bottom = (x: number): Terminal => ({ channel: 1, leaves: 'down', x, minX: x - 40, maxX: x + 40, reach: 0 });
  const route = (connections: { terminals: Terminal[]; mainChannel: number }[]) =>
    routeConnections({
      connections,
      rowObstacles: [[{ left: 0, right: 2000 }], [{ left: 0, right: 2000 }]],
      rowHeight: 84,
      minChannelHeight: 96,
    });

  it('slides a line along its card when it would land on another line', () => {
    const { routes } = route([
      { terminals: [top(100), bottom(300)], mainChannel: 1 },
      { terminals: [top(300), bottom(500)], mainChannel: 1 },
    ]);
    const uprights = routes.flatMap((r) => r.paths.flatMap(segmentsOf)).filter((s) => s.x1 === s.x2);
    expect(uprights.filter((s) => s.x1 === 300)).toHaveLength(1);
  });

  it('grows a channel instead of squeezing its lanes together', () => {
    const connections = Array.from({ length: 12 }, (_, index) => ({
      terminals: [top(100 + index * 20), bottom(1000 + index * 20)],
      mainChannel: 1,
    }));
    const { routes, rowTops } = route(connections);
    expect(rowTops[1] - rowTops[0] - 84).toBeGreaterThan(96);
    const lanes = routes.map((r) => r.laneY).sort((a, b) => a - b);
    lanes.slice(1).forEach((lane, index) => expect(lane - lanes[index]).toBeGreaterThanOrEqual(16));
  });

  it('takes a line around the cards in a row it has to pass through', () => {
    const { routes } = routeConnections({
      connections: [
        {
          terminals: [
            { channel: 1, leaves: 'up', x: 100, minX: 100, maxX: 100, reach: 0 },
            { channel: 2, leaves: 'down', x: 100, minX: 100, maxX: 100, reach: 0 },
          ],
          mainChannel: 1,
        },
      ],
      rowObstacles: [[{ left: 0, right: 184 }], [{ left: 0, right: 184 }], [{ left: 0, right: 184 }]],
      rowHeight: 84,
      minChannelHeight: 96,
    });
    const crossingRow = routes[0].paths.flatMap(segmentsOf).filter((s) => s.x1 === s.x2 && s.y2 - s.y1 > 84);
    expect(crossingRow).toHaveLength(1);
    expect(crossingRow[0].x1 < 0 || crossingRow[0].x1 > 184).toBe(true);
  });
});

describe('wouldCreateCycle', () => {
  const links = [
    { parentId: 'grandma', childId: 'mom' },
    { parentId: 'mom', childId: 'me' },
  ];

  it('refuses making someone their own parent', () => {
    expect(wouldCreateCycle(links, 'me', 'me')).toBe(true);
  });

  it('refuses making a descendant into an ancestor', () => {
    expect(wouldCreateCycle(links, 'me', 'grandma')).toBe(true);
  });

  it('allows an ordinary new link', () => {
    expect(wouldCreateCycle(links, 'dad', 'me')).toBe(false);
  });

  it('copes with existing bad data without looping forever', () => {
    const looped = [
      { parentId: 'a', childId: 'b' },
      { parentId: 'b', childId: 'a' },
    ];
    expect(wouldCreateCycle(looped, 'x', 'a')).toBe(false);
  });
});
