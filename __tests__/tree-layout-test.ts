import { wouldCreateCycle } from '@/features/tree/graph';
import { CARD_WIDTH, layoutTree, type TreeInput } from '@/features/tree/layout';

function positions(input: TreeInput) {
  const layout = layoutTree(input);
  return { layout, at: new Map(layout.people.map((person) => [person.id, person])) };
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
    const { layout } = positions({
      ids: ['hub', 'spouse1', 'spouse2', 'a', 'b', 'c'],
      spouses: [
        { firstId: 'hub', secondId: 'spouse1' },
        { firstId: 'hub', secondId: 'spouse2' },
      ],
      parentChild: [
        { parentId: 'hub', childId: 'a' },
        { parentId: 'spouse1', childId: 'a' },
        { parentId: 'hub', childId: 'b' },
        { parentId: 'spouse1', childId: 'b' },
        { parentId: 'hub', childId: 'c' },
        { parentId: 'spouse2', childId: 'c' },
      ],
    });
    const [first, second] = layout.familyLines;
    expect(first.busY).not.toBe(second.busY);
    for (const family of layout.familyLines) {
      expect(family.busY).toBeGreaterThan(family.originY);
      expect(family.busY).toBeLessThan(Math.min(...family.children.map((child) => child.y)));
    }
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
