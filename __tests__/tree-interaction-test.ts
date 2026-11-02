import { cameraShowing, clampScale, MAX_SCALE, MIN_SCALE, toTreePoint, zoomAround } from '@/features/tree/camera';
import { EDGE_INSET, EDGE_MARGIN, hitTest, zoneAt } from '@/features/tree/hit-zones';
import { CARD_HEIGHT, CARD_WIDTH } from '@/features/tree/layout';
import { initialsOf, yearSpan } from '@/lib/format';

const MIDDLE_X = CARD_WIDTH / 2;
const MIDDLE_Y = CARD_HEIGHT / 2;

describe('zoneAt', () => {
  it('treats the middle of the card as the card itself', () => {
    expect(zoneAt(MIDDLE_X, MIDDLE_Y)).toBe('card');
    expect(zoneAt(EDGE_INSET + 1, EDGE_INSET + 1)).toBe('card');
  });

  it('maps the top and bottom edges to parent and child', () => {
    expect(zoneAt(MIDDLE_X, EDGE_INSET - 1)).toBe('top');
    expect(zoneAt(MIDDLE_X, CARD_HEIGHT - EDGE_INSET + 1)).toBe('bottom');
  });

  it('treats both side edges the same', () => {
    expect(zoneAt(EDGE_INSET - 1, MIDDLE_Y)).toBe('side');
    expect(zoneAt(CARD_WIDTH - EDGE_INSET + 1, MIDDLE_Y)).toBe('side');
  });

  it('counts the margin outside the card as that edge', () => {
    expect(zoneAt(MIDDLE_X, -EDGE_MARGIN)).toBe('top');
    expect(zoneAt(MIDDLE_X, CARD_HEIGHT + EDGE_MARGIN)).toBe('bottom');
    expect(zoneAt(-EDGE_MARGIN, MIDDLE_Y)).toBe('side');
    expect(zoneAt(CARD_WIDTH + EDGE_MARGIN, MIDDLE_Y)).toBe('side');
  });

  it('goes with whichever edge is closer near a corner', () => {
    expect(zoneAt(10, 2)).toBe('top');
    expect(zoneAt(2, 10)).toBe('side');
  });
});

describe('hitTest', () => {
  const left = { id: 'left', x: 0, y: 0 };
  // Close enough that the tap areas between them overlap
  const right = { id: 'right', x: CARD_WIDTH + EDGE_MARGIN, y: 0 };

  it('finds nothing away from every card', () => {
    expect(hitTest([left], CARD_WIDTH + EDGE_MARGIN + 1, MIDDLE_Y)).toBeNull();
    expect(hitTest([left], MIDDLE_X, -EDGE_MARGIN - 1)).toBeNull();
    expect(hitTest([], 0, 0)).toBeNull();
  });

  it('finds the card and the edge', () => {
    expect(hitTest([left], MIDDLE_X, MIDDLE_Y)).toEqual({ personId: 'left', zone: 'card' });
    expect(hitTest([left], MIDDLE_X, -5)).toEqual({ personId: 'left', zone: 'top' });
  });

  it('gives overlapping tap areas to the closest card', () => {
    expect(hitTest([left, right], CARD_WIDTH + 5, MIDDLE_Y)?.personId).toBe('left');
    expect(hitTest([left, right], CARD_WIDTH + EDGE_MARGIN - 5, MIDDLE_Y)?.personId).toBe('right');
  });
});

describe('camera', () => {
  it('keeps the point under the fingers still while zooming', () => {
    const camera = { x: 30, y: -40, scale: 1 };
    const before = toTreePoint(camera, 200, 300);
    const after = toTreePoint(zoomAround(camera, 200, 300, 1.7), 200, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('stops zooming at the limits, without sliding the view', () => {
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
    const camera = { x: 10, y: 20, scale: MAX_SCALE };
    expect(zoomAround(camera, 100, 100, MAX_SCALE * 3)).toEqual(camera);
  });

  it('puts a chosen tree point at a chosen screen point', () => {
    const camera = cameraShowing(500, 250, 195, 400, 0.5);
    expect(toTreePoint(camera, 195, 400)).toEqual({ x: 500, y: 250 });
  });
});

describe('card text', () => {
  it('shows years only', () => {
    expect(yearSpan({ birthDate: '1980-02-29', deathDate: null, isDeceased: false })).toBe('Born 1980');
    expect(yearSpan({ birthDate: null, deathDate: null, isDeceased: false })).toBe('');
    expect(yearSpan({ birthDate: '1920-01-01', deathDate: '1990-05-05', isDeceased: true })).toBe('1920 – 1990');
    expect(yearSpan({ birthDate: null, deathDate: '1990-05-05', isDeceased: true })).toBe('? – 1990');
    expect(yearSpan({ birthDate: null, deathDate: null, isDeceased: true })).toBe('Deceased');
  });

  it('makes initials from the first and last names', () => {
    expect(initialsOf('Maria Clara Tan')).toBe('MT');
    expect(initialsOf('  maria  ')).toBe('M');
  });
});
