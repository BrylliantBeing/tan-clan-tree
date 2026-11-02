import { CARD_HEIGHT, CARD_WIDTH } from './layout';

// How far outside a card a tap still counts, and how far inside a card its edge reaches
export const EDGE_MARGIN = 20;
export const EDGE_INSET = 14;

export type Zone = 'card' | 'top' | 'bottom' | 'side';

export type Hit = { personId: string; zone: Zone };

type Positioned = { id: string; x: number; y: number };

// How far a point is from the card, or 0 when it is on the card
function distanceToCard(person: Positioned, x: number, y: number) {
  const dx = Math.max(person.x - x, 0, x - (person.x + CARD_WIDTH));
  const dy = Math.max(person.y - y, 0, y - (person.y + CARD_HEIGHT));
  return Math.hypot(dx, dy);
}

// x and y are relative to the card's top left corner
export function zoneAt(x: number, y: number): Zone {
  const fromLeft = x;
  const fromRight = CARD_WIDTH - x;
  const fromTop = y;
  const fromBottom = CARD_HEIGHT - y;
  const nearest = Math.min(fromLeft, fromRight, fromTop, fromBottom);

  if (nearest > EDGE_INSET) return 'card';
  if (nearest === fromTop) return 'top';
  if (nearest === fromBottom) return 'bottom';
  return 'side';
}

// x and y are in the tree's coordinates. When tap areas overlap, the closest card wins.
export function hitTest(people: Positioned[], x: number, y: number): Hit | null {
  let closest: Positioned | null = null;
  let closestDistance = Infinity;
  for (const person of people) {
    if (x < person.x - EDGE_MARGIN || x > person.x + CARD_WIDTH + EDGE_MARGIN) continue;
    if (y < person.y - EDGE_MARGIN || y > person.y + CARD_HEIGHT + EDGE_MARGIN) continue;
    const distance = distanceToCard(person, x, y);
    if (distance < closestDistance) {
      closest = person;
      closestDistance = distance;
    }
  }
  if (!closest) return null;
  return { personId: closest.id, zone: zoneAt(x - closest.x, y - closest.y) };
}
