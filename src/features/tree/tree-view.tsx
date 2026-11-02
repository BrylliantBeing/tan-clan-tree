import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  PointerType,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Hint } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { Avatar } from '@/features/people/avatar';
import { useSession } from '@/features/session/session-context';
import { useTheme } from '@/hooks/use-theme';
import { yearSpan } from '@/lib/format';

import { AddRelativeSheet, type AddZone } from './add-relative-sheet';
import { type Camera, cameraShowing, toTreePoint, zoomAround } from './camera';
import { type Hit, hitTest, type Zone } from './hit-zones';
import { CARD_HEIGHT, CARD_WIDTH, layoutTree } from './layout';
import { PersonDetails } from './person-details';
import { type Person, type TreeData } from './use-tree';

const LINE_PADDING = 40;
const OVER_THE_TOP_RISE = 22;
const WIDE_SCREEN = 640;
const ZOOM_STEP = 1.3;
const HANDLE_SIZE = 24;
const MOVE_TIMING = { duration: 220 };
// Tall enough that a card lifted to here stays clear of the details sheet on a phone
const SHEET_CARD_HEIGHT = 0.22;

const HANDLES: { zone: Zone; left: number; top: number }[] = [
  { zone: 'top', left: CARD_WIDTH / 2, top: 0 },
  { zone: 'bottom', left: CARD_WIDTH / 2, top: CARD_HEIGHT },
  { zone: 'side', left: 0, top: CARD_HEIGHT / 2 },
  { zone: 'side', left: CARD_WIDTH, top: CARD_HEIGHT / 2 },
];

function PersonCard({
  person,
  x,
  y,
  isSelf,
  isSelected,
  onActivate,
  onFocus,
}: {
  person: Person;
  x: number;
  y: number;
  isSelf: boolean;
  isSelected: boolean;
  onActivate: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const theme = useTheme();
  const highlighted = isSelf || isSelected;
  return (
    // Pointers go through to the tree's own tap handling, which also sees the area around the card.
    // Keyboards and screen readers still reach this button.
    <Pressable
      role="button"
      accessibilityLabel={`${person.fullName}${person.isDeceased ? ', deceased' : ''}`}
      onPress={() => onActivate(person.id)}
      onFocus={() => onFocus(person.id)}
      style={[
        styles.card,
        {
          left: x,
          top: y,
          backgroundColor: theme.backgroundElement,
          borderColor: highlighted ? theme.accent : theme.border,
          borderWidth: highlighted ? 2 : 1,
        },
      ]}>
      <Avatar person={person} size={48} />
      <View style={styles.cardText}>
        <ThemedText type="smallBold" numberOfLines={2} style={styles.cardName}>
          {person.fullName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.cardDates}>
          {yearSpan(person)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function EdgeHandles({ x, y, activeZone }: { x: number; y: number; activeZone: Zone | null }) {
  const theme = useTheme();
  return (
    <View style={[styles.handles, { left: x, top: y }]}>
      {HANDLES.map(({ zone, left, top }) => (
        <View
          key={`${left}-${top}`}
          style={[
            styles.handle,
            {
              left: left - HANDLE_SIZE / 2,
              top: top - HANDLE_SIZE / 2,
              backgroundColor: zone === activeZone ? theme.accent : theme.background,
              borderColor: theme.accent,
            },
          ]}>
          <ThemedText type="smallBold" style={[styles.handleText, { color: zone === activeZone ? theme.onAccent : theme.accent }]}>
            +
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

function ControlButton({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.control, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="smallBold" style={styles.controlText}>
        {glyph}
      </ThemedText>
    </Pressable>
  );
}

export function TreeView({ tree, selfId }: { tree: TreeData; selfId: string }) {
  const theme = useTheme();
  const { user } = useSession();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(selfId);
  const [hover, setHover] = useState<Hit | null>(null);
  const [adding, setAdding] = useState<{ personId: string; zone: AddZone } | null>(null);
  const [showIntro, setShowIntro] = useState(true);

  const viewportRef = useRef<ComponentRef<typeof View>>(null);
  const didCenter = useRef(false);
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const cameraScale = useSharedValue(1);
  const lastFocalX = useSharedValue(0);
  const lastFocalY = useSharedValue(0);

  const layout = useMemo(
    () =>
      layoutTree({
        ids: tree.people.map((person) => person.id),
        spouses: tree.spouses,
        parentChild: tree.parentChild,
      }),
    [tree]
  );
  const peopleById = useMemo(() => new Map(tree.people.map((person) => [person.id, person])), [tree]);
  const positionsById = useMemo(() => new Map(layout.people.map((person) => [person.id, person])), [layout]);

  const isWide = viewport.width >= WIDE_SCREEN;
  const selected = selectedId ? peopleById.get(selectedId) : undefined;
  const selectedPosition = selectedId ? positionsById.get(selectedId) : undefined;
  const addingPerson = adding ? peopleById.get(adding.personId) : undefined;
  const handleId = hover?.personId ?? activeId;
  const handlePosition = positionsById.get(handleId);

  const currentCamera = (): Camera => ({ x: cameraX.get(), y: cameraY.get(), scale: cameraScale.get() });

  const setCamera = ({ x, y, scale }: Camera) => {
    cameraX.set(x);
    cameraY.set(y);
    cameraScale.set(scale);
  };

  const moveCamera = ({ x, y, scale }: Camera) => {
    cameraX.set(withTiming(x, MOVE_TIMING));
    cameraY.set(withTiming(y, MOVE_TIMING));
    cameraScale.set(withTiming(scale, MOVE_TIMING));
  };

  const cameraOnPerson = (id: string, screenX: number, screenY: number, scale: number) => {
    const position = positionsById.get(id);
    const treeX = position ? position.x + CARD_WIDTH / 2 : layout.width / 2;
    const treeY = position ? position.y + CARD_HEIGHT / 2 : layout.height / 2;
    return cameraShowing(treeX, treeY, screenX, screenY, scale);
  };

  const selectPerson = (id: string) => {
    setShowIntro(false);
    setSelectedId(id);
    setActiveId(id);
    // On a phone the details cover the lower part of the screen, so lift the card clear of them
    if (!isWide) {
      moveCamera(cameraOnPerson(id, viewport.width / 2, viewport.height * SHEET_CARD_HEIGHT, cameraScale.get()));
    }
  };

  const startAdding = (personId: string, zone: AddZone) => {
    setShowIntro(false);
    setSelectedId(null);
    setActiveId(personId);
    setAdding({ personId, zone });
  };

  const handleTap = (screenX: number, screenY: number) => {
    const point = toTreePoint(currentCamera(), screenX, screenY);
    const hit = hitTest(layout.people, point.x, point.y);
    if (!hit) setSelectedId(null);
    else if (hit.zone === 'card') selectPerson(hit.personId);
    else startAdding(hit.personId, hit.zone);
  };

  const zoomBy = (factor: number) => {
    const camera = currentCamera();
    moveCamera(zoomAround(camera, viewport.width / 2, viewport.height / 2, camera.scale * factor));
  };

  const pan = usePanGesture({
    minDistance: 8,
    maxPointers: 1,
    onActivate: () => {
      cancelAnimation(cameraX);
      cancelAnimation(cameraY);
    },
    onUpdate: (event) => {
      cameraX.set(cameraX.get() + event.changeX);
      cameraY.set(cameraY.get() + event.changeY);
    },
  });

  const pinch = usePinchGesture({
    onActivate: (event) => {
      cancelAnimation(cameraX);
      cancelAnimation(cameraY);
      cancelAnimation(cameraScale);
      lastFocalX.set(event.focalX);
      lastFocalY.set(event.focalY);
    },
    onUpdate: (event) => {
      const scale = cameraScale.get();
      // Both fingers moving together drags the tree, on top of zooming around the point between them
      const camera = {
        x: cameraX.get() + event.focalX - lastFocalX.get(),
        y: cameraY.get() + event.focalY - lastFocalY.get(),
        scale,
      };
      const next = zoomAround(camera, event.focalX, event.focalY, scale * event.scaleChange);
      cameraX.set(next.x);
      cameraY.set(next.y);
      cameraScale.set(next.scale);
      lastFocalX.set(event.focalX);
      lastFocalY.set(event.focalY);
    },
  });

  const tap = useTapGesture({
    runOnJS: true,
    maxDistance: 8,
    maxDuration: 1000,
    onActivate: (event) => {
      // On web, the gesture library also reports Enter and Space as taps. The card's button handles those.
      if (event.pointerType !== PointerType.KEY) handleTap(event.x, event.y);
    },
  });

  const gesture = useSimultaneousGestures(pan, pinch, tap);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cameraX.get() }, { translateY: cameraY.get() }, { scale: cameraScale.get() }],
  }));

  // Browser-only input that the gesture library doesn't cover: the mouse wheel, trackpad zoom and hovering
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = viewportRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimation(cameraX);
      cancelAnimation(cameraY);
      cancelAnimation(cameraScale);
      const bounds = node.getBoundingClientRect();
      // Pinching on a trackpad arrives as a wheel event with small steps and the ctrl key set
      const speed = event.ctrlKey ? 0.01 : 0.0015;
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const camera = { x: cameraX.get(), y: cameraY.get(), scale: cameraScale.get() };
      const next = zoomAround(
        camera,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
        camera.scale * Math.exp(-event.deltaY * lines * speed)
      );
      cameraX.set(next.x);
      cameraY.set(next.y);
      cameraScale.set(next.scale);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
      const bounds = node.getBoundingClientRect();
      const camera = { x: cameraX.get(), y: cameraY.get(), scale: cameraScale.get() };
      const point = toTreePoint(camera, event.clientX - bounds.left, event.clientY - bounds.top);
      const hit = hitTest(layout.people, point.x, point.y);
      node.style.cursor = hit ? 'pointer' : 'grab';
      setHover((current) =>
        current?.personId === hit?.personId && current?.zone === hit?.zone ? current : hit
      );
    };

    const onPointerLeave = () => setHover(null);

    // Browsers send a click shortly after a touch ends. By then a tap may have opened a sheet under the
    // finger, and the click would land on it and close it right away. Taps here don't need that click.
    const onTouchEnd = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };

    // Tabbing to an off-screen card makes the browser scroll this view, which would throw off every position
    const onScroll = () => {
      node.scrollLeft = 0;
      node.scrollTop = 0;
    };

    node.style.cursor = 'grab';
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerleave', onPointerLeave);
    node.addEventListener('touchend', onTouchEnd, { passive: false });
    node.addEventListener('scroll', onScroll);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerleave', onPointerLeave);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('scroll', onScroll);
    };
  }, [layout, cameraX, cameraY, cameraScale]);

  const linePaths = useMemo(() => {
    const paths: string[] = [];
    for (const line of layout.spouseLines) {
      if (line.adjacent) {
        paths.push(`M ${line.fromX} ${line.y} L ${line.toX} ${line.y}`);
      } else {
        const { leftX, leftY, rightX, rightY } = line.overTop;
        const top = Math.min(leftY, rightY) - OVER_THE_TOP_RISE;
        paths.push(`M ${leftX} ${leftY} L ${leftX} ${top} L ${rightX} ${top} L ${rightX} ${rightY}`);
      }
    }
    for (const family of layout.familyLines) {
      paths.push(`M ${family.originX} ${family.stemY} L ${family.originX} ${family.busY}`);
      for (const child of family.children) {
        paths.push(`M ${family.originX} ${family.busY} L ${child.x} ${family.busY} L ${child.x} ${child.y}`);
      }
    }
    return paths;
  }, [layout]);

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture} touchAction="none" userSelect="none">
        <View
          ref={viewportRef}
          style={styles.viewport}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            if (width === 0) return;
            if (!didCenter.current) {
              didCenter.current = true;
              setCamera(cameraOnPerson(selfId, width / 2, height / 2, 1));
            }
            setViewport({ width, height });
          }}>
          {viewport.width > 0 ? (
            <Animated.View style={[styles.canvas, canvasStyle]}>
              <Svg
                width={layout.width + LINE_PADDING * 2}
                height={layout.height + LINE_PADDING * 2}
                style={styles.lines}>
                {linePaths.map((path) => (
                  <Path
                    key={path}
                    d={path}
                    transform={`translate(${LINE_PADDING} ${LINE_PADDING})`}
                    stroke={theme.textSecondary}
                    strokeWidth={1.5}
                    fill="none"
                  />
                ))}
              </Svg>
              {layout.people.map((position) => {
                const person = peopleById.get(position.id);
                if (!person) return null;
                return (
                  <PersonCard
                    key={person.id}
                    person={person}
                    x={position.x}
                    y={position.y}
                    isSelf={person.id === selfId}
                    isSelected={person.id === selectedId}
                    onActivate={selectPerson}
                    onFocus={(id) =>
                      moveCamera(cameraOnPerson(id, viewport.width / 2, viewport.height / 2, cameraScale.get()))
                    }
                  />
                );
              })}
              {handlePosition ? (
                <EdgeHandles
                  x={handlePosition.x}
                  y={handlePosition.y}
                  activeZone={hover?.personId === handleId ? hover.zone : null}
                />
              ) : null}
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      {showIntro ? (
        <ThemedView type="backgroundElement" style={styles.intro} pointerEvents="none">
          <Hint>Tap someone to see their details. Tap the edge of their card to add family.</Hint>
        </ThemedView>
      ) : null}

      <View style={styles.controls}>
        <ControlButton label="Zoom in" glyph="+" onPress={() => zoomBy(ZOOM_STEP)} />
        <ControlButton label="Zoom out" glyph="−" onPress={() => zoomBy(1 / ZOOM_STEP)} />
        <ControlButton
          label="Center on me"
          glyph="◎"
          onPress={() => moveCamera(cameraOnPerson(selfId, viewport.width / 2, viewport.height / 2, cameraScale.get()))}
        />
      </View>

      {selected && selectedPosition ? (
        <PersonDetails
          person={selected}
          position={selectedPosition}
          cameraX={cameraX}
          cameraY={cameraY}
          cameraScale={cameraScale}
          viewport={viewport}
          isWide={isWide}
          isSelf={selected.id === selfId}
          isAdmin={user?.role === 'admin'}
          onAdd={(zone) => startAdding(selected.id, zone)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {adding && addingPerson ? (
        <AddRelativeSheet
          key={`${adding.personId}-${adding.zone}`}
          tree={tree}
          person={addingPerson}
          zone={adding.zone}
          onClose={() => setAdding(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    transformOrigin: 'left top',
  },
  lines: {
    position: 'absolute',
    left: -LINE_PADDING,
    top: -LINE_PADDING,
  },
  card: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  cardText: {
    flex: 1,
  },
  cardName: {
    lineHeight: 18,
  },
  cardDates: {
    fontSize: 12,
    lineHeight: 16,
  },
  handles: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    pointerEvents: 'none',
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleText: {
    lineHeight: 18,
  },
  intro: {
    position: 'absolute',
    top: Spacing.three,
    alignSelf: 'center',
    maxWidth: '90%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  controls: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    gap: Spacing.two,
  },
  control: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: {
    fontSize: 20,
    lineHeight: 24,
  },
});
