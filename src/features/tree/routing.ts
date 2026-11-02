// Runs the tree's lines through the channels, the empty bands above and below each row of cards.
// Channel i is the band directly above row i. Each line gets a horizontal lane in its channel, so lines
// of different families can cross at a right angle but never run along each other.

// The closest two different lines' verticals can sit, close enough below this to read as one line
const PIN_SPACING = 12;
const LANE_SPACING = 16;
// Lines end to end at one height need this much space between them, or they look joined
const SHARED_LANE_GAP = 24;
// Lines going around the outside of the tree stay within the drawing's padding
const MAX_LEFT_COLUMNS = 3;

export type Span = { left: number; right: number };

// Where a line meets a card or a couple's line. It leaves its channel upward or downward, reaching
// `reach` past the channel's edge. The line may slide between minX and maxX to stay clear of others.
export type Terminal = {
  channel: number;
  leaves: 'up' | 'down';
  x: number;
  minX: number;
  maxX: number;
  reach: number;
};

export type Connection = { terminals: Terminal[]; mainChannel: number };

export type RouteInput = {
  connections: Connection[];
  // What a vertical line can't pass through in each row
  rowObstacles: Span[][];
  rowHeight: number;
  minChannelHeight: number;
};

export type RouteResult = {
  // One entry per connection, in the same order
  routes: { paths: string[]; laneY: number }[];
  rowTops: number[];
  height: number;
};

type Pin = Terminal & { owner: number };

type Net = { owner: number; pins: Pin[]; left: number; right: number; lane: number };

function pinsConflict(pins: Pin[], owner: number, x: number) {
  return pins.some((pin) => pin.owner !== owner && Math.abs(pin.x - x) < PIN_SPACING);
}

// Lines that start from a couple can't move, so everything else slides away from them
function separatePins(pins: Pin[]) {
  const ordered = [...pins].sort((a, b) => a.maxX - a.minX - (b.maxX - b.minX) || a.x - b.x || a.owner - b.owner);
  const placed: Pin[] = [];
  for (const pin of ordered) {
    const wanted = pin.x;
    for (let step = 0; step <= 2 * (pins.length + 1); step += 1) {
      const offset = (step % 2 === 0 ? step / 2 : -(step + 1) / 2) * PIN_SPACING;
      const x = wanted + offset;
      if (x < pin.minX || x > pin.maxX || pinsConflict(placed, pin.owner, x)) continue;
      pin.x = x;
      break;
    }
    placed.push(pin);
  }
}

// The nearest place a line can pass through a row, staying off the lines already in the channels on either side
function freeColumn(wanted: number, obstacles: Span[], owner: number, pins: Pin[]) {
  const blocked = (x: number) =>
    obstacles.some(({ left, right }) => x > left - PIN_SPACING && x < right + PIN_SPACING) ||
    pinsConflict(pins, owner, x);
  if (!blocked(wanted)) return wanted;

  const candidates: number[] = [];
  obstacles.forEach(({ left, right }, index) => {
    const nextLeft = obstacles[index + 1]?.left ?? right + PIN_SPACING * (pins.length + 2);
    for (let x = right + PIN_SPACING; x <= nextLeft - PIN_SPACING; x += PIN_SPACING) candidates.push(x);
    if (index === 0) {
      for (let column = 1; column <= MAX_LEFT_COLUMNS; column += 1) candidates.push(left - column * PIN_SPACING);
    }
  });
  const open = candidates.filter((x) => !blocked(x));
  return open.reduce((best, x) => (Math.abs(x - wanted) < Math.abs(best - wanted) ? x : best), open[0]);
}

function spansTouch(a: Net, b: Net) {
  return a.left < b.right + SHARED_LANE_GAP && b.left < a.right + SHARED_LANE_GAP;
}

// How many times the lines cross if `upper` takes the higher lane
function crossingsWhenAbove(upper: Net, lower: Net) {
  const within = (x: number, net: Net) => x >= net.left && x <= net.right;
  const goingDown = upper.pins.filter((pin) => pin.leaves === 'down' && within(pin.x, lower)).length;
  const comingFromAbove = lower.pins.filter((pin) => pin.leaves === 'up' && within(pin.x, upper)).length;
  return goingDown + comingFromAbove;
}

// Takes the net that costs the fewest crossings from the top down, sharing lanes where nets don't touch
function assignLanes(nets: Net[]) {
  const remaining = nets
    .filter((net) => net.right > net.left)
    .sort((a, b) => a.left - b.left || a.owner - b.owner);
  const placed: Net[] = [];
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestCost = Infinity;
    remaining.forEach((net, index) => {
      const cost = remaining.reduce((sum, other) => (other === net ? sum : sum + crossingsWhenAbove(net, other)), 0);
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
      }
    });
    const [net] = remaining.splice(bestIndex, 1);
    net.lane = placed.reduce((lane, other) => (spansTouch(net, other) ? Math.max(lane, other.lane + 1) : lane), 0);
    placed.push(net);
  }
  return placed.reduce((lanes, net) => Math.max(lanes, net.lane + 1), 0);
}

// A connection reaching past its main channel passes through the rows in between
function addThroughLines(owner: number, connection: Connection, input: RouteInput, pinsByChannel: Pin[][]) {
  const { terminals, mainChannel } = connection;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const pass = (row: number, wanted: number) => {
    const nearby = [...pinsByChannel[row], ...pinsByChannel[row + 1]];
    const x = freeColumn(wanted, input.rowObstacles[row], owner, nearby);
    const fixed = { x, minX: x, maxX: x, owner };
    pinsByChannel[row].push({ ...fixed, channel: row, leaves: 'down', reach: input.rowHeight });
    pinsByChannel[row + 1].push({ ...fixed, channel: row + 1, leaves: 'up', reach: 0 });
  };

  const lowest = Math.max(...terminals.map((terminal) => terminal.channel));
  for (let channel = mainChannel + 1; channel <= lowest; channel += 1) {
    pass(channel - 1, mean(terminals.filter((terminal) => terminal.channel >= channel).map((terminal) => terminal.x)));
  }
  const highest = Math.min(...terminals.map((terminal) => terminal.channel));
  for (let channel = mainChannel - 1; channel >= highest; channel -= 1) {
    pass(channel, mean(terminals.filter((terminal) => terminal.channel <= channel).map((terminal) => terminal.x)));
  }
}

export function routeConnections(input: RouteInput): RouteResult {
  const { connections, rowObstacles, rowHeight, minChannelHeight } = input;
  const rowCount = rowObstacles.length;
  const pinsByChannel: Pin[][] = Array.from({ length: rowCount + 1 }, () => []);

  connections.forEach(({ terminals }, owner) => {
    for (const terminal of terminals) pinsByChannel[terminal.channel].push({ ...terminal, owner });
  });
  for (const pins of pinsByChannel) separatePins(pins);
  connections.forEach((connection, owner) => addThroughLines(owner, connection, input, pinsByChannel));

  const netsByChannel = pinsByChannel.map((pins) => {
    const nets = new Map<number, Net>();
    for (const pin of pins) {
      const net = nets.get(pin.owner);
      if (net) {
        net.pins.push(pin);
        net.left = Math.min(net.left, pin.x);
        net.right = Math.max(net.right, pin.x);
      } else {
        nets.set(pin.owner, { owner: pin.owner, pins: [pin], left: pin.x, right: pin.x, lane: 0 });
      }
    }
    return [...nets.values()];
  });
  const laneCounts = netsByChannel.map(assignLanes);

  // Busy channels grow instead of squeezing their lanes together. The outer ones only exist when used.
  const channelHeights = pinsByChannel.map((pins, channel) => {
    const needed = (laneCounts[channel] + 1) * LANE_SPACING;
    const isOuter = channel === 0 || channel === rowCount;
    if (isOuter) return pins.length > 0 ? needed : 0;
    return Math.max(minChannelHeight, needed);
  });

  const rowTops: number[] = [];
  let cursor = 0;
  for (let row = 0; row < rowCount; row += 1) {
    cursor += channelHeights[row];
    rowTops.push(cursor);
    cursor += rowHeight;
  }
  const height = rowCount > 0 ? cursor + channelHeights[rowCount] : 0;

  const channelTop = (channel: number) => (channel === 0 ? 0 : rowTops[channel - 1] + rowHeight);
  const routes: RouteResult['routes'] = connections.map(() => ({ paths: [], laneY: 0 }));
  netsByChannel.forEach((nets, channel) => {
    const top = channelTop(channel);
    const bottom = top + channelHeights[channel];
    for (const net of nets) {
      // A straight line down needs no lane of its own, so it runs through the middle
      const fraction = net.right > net.left ? (net.lane + 1) / (laneCounts[channel] + 1) : 0.5;
      const laneY = top + channelHeights[channel] * fraction;
      const parts = net.right > net.left ? [`M ${net.left} ${laneY} L ${net.right} ${laneY}`] : [];
      for (const pin of net.pins) {
        const endY = pin.leaves === 'up' ? top - pin.reach : bottom + pin.reach;
        parts.push(`M ${pin.x} ${laneY} L ${pin.x} ${endY}`);
      }
      const route = routes[net.owner];
      route.paths.push(parts.join(' '));
      if (channel === connections[net.owner].mainChannel) route.laneY = laneY;
    }
  });

  return { routes, rowTops, height };
}
