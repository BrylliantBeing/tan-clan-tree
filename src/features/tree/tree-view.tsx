import { Link } from 'expo-router';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button, Hint } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lifeSpan } from '@/lib/format';

import { CARD_HEIGHT, CARD_WIDTH, layoutTree } from './layout';
import { type TreeData } from './use-tree';

const PADDING = 40;
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25];
const DEFAULT_ZOOM_INDEX = 2;
const OVER_THE_TOP_RISE = 22;

export function TreeView({ tree, initialFocusId }: { tree: TreeData; initialFocusId: string }) {
  const theme = useTheme();
  const [focusId, setFocusId] = useState(initialFocusId);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const horizontal = useRef<ComponentRef<typeof ScrollView>>(null);
  const vertical = useRef<ComponentRef<typeof ScrollView>>(null);

  const zoom = ZOOM_LEVELS[zoomIndex];
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
  const focused = peopleById.get(focusId);
  const focusedPosition = layout.people.find((person) => person.id === focusId);

  const contentWidth = layout.width + PADDING * 2;
  const contentHeight = layout.height + PADDING * 2;

  // Keeps the focused person in the middle of the screen
  useEffect(() => {
    if (!focusedPosition || viewport.width === 0) return;
    const centerX = (focusedPosition.x + PADDING + CARD_WIDTH / 2) * zoom;
    const centerY = (focusedPosition.y + PADDING + CARD_HEIGHT / 2) * zoom;
    horizontal.current?.scrollTo({ x: Math.max(0, centerX - viewport.width / 2), animated: true });
    vertical.current?.scrollTo({ y: Math.max(0, centerY - viewport.height / 2), animated: true });
  }, [focusedPosition, viewport, zoom]);

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
      paths.push(`M ${family.originX} ${family.originY} L ${family.originX} ${family.busY}`);
      for (const child of family.children) {
        paths.push(`M ${family.originX} ${family.busY} L ${child.x} ${family.busY} L ${child.x} ${child.y}`);
      }
    }
    return paths;
  }, [layout]);

  return (
    <View style={styles.container}>
      <View
        style={styles.viewport}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setViewport({ width, height });
        }}>
        <ScrollView ref={vertical} style={styles.fill} contentContainerStyle={styles.grow}>
          <ScrollView ref={horizontal} horizontal contentContainerStyle={styles.grow}>
            <View style={{ width: contentWidth * zoom, height: contentHeight * zoom }}>
              <View style={[styles.canvas, { width: contentWidth, height: contentHeight, transform: [{ scale: zoom }] }]}>
                <Svg width={contentWidth} height={contentHeight} style={styles.lines}>
                  {linePaths.map((path) => (
                    <Path
                      key={path}
                      d={path}
                      transform={`translate(${PADDING} ${PADDING})`}
                      stroke={theme.textSecondary}
                      strokeWidth={1.5}
                      fill="none"
                    />
                  ))}
                </Svg>
                {layout.people.map((position) => {
                  const person = peopleById.get(position.id);
                  if (!person) return null;
                  const isFocused = person.id === focusId;
                  return (
                    <Pressable
                      key={person.id}
                      role="button"
                      accessibilityLabel={`${person.fullName}${person.isDeceased ? ', deceased' : ''}`}
                      aria-pressed={isFocused}
                      onPress={() => setFocusId(person.id)}
                      style={[
                        styles.card,
                        {
                          left: position.x + PADDING,
                          top: position.y + PADDING,
                          backgroundColor: theme.backgroundElement,
                          borderColor: isFocused ? theme.accent : theme.border,
                          borderWidth: isFocused ? 2 : 1,
                        },
                      ]}>
                      <ThemedText type="smallBold" numberOfLines={2}>
                        {person.fullName}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.cardDates} numberOfLines={2}>
                        {lifeSpan(person)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      <ThemedView type="backgroundElement" style={styles.panel}>
        <View style={styles.panelText}>
          {focused ? (
            <>
              <ThemedText type="smallBold">{focused.fullName}</ThemedText>
              <Hint>{lifeSpan(focused) || 'No dates added yet'}</Hint>
              <Link href={{ pathname: '/person/[id]', params: { id: focused.id } }} style={{ color: theme.accent }}>
                View profile
              </Link>
            </>
          ) : (
            <Hint>Tap someone to center the tree on them.</Hint>
          )}
        </View>
        <View style={styles.zoom}>
          <Button
            label="−"
            variant="secondary"
            disabled={zoomIndex === 0}
            onPress={() => setZoomIndex(zoomIndex - 1)}
          />
          <Button
            label="+"
            variant="secondary"
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            onPress={() => setZoomIndex(zoomIndex + 1)}
          />
        </View>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  viewport: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  canvas: {
    transformOrigin: 'top left',
  },
  lines: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    overflow: 'hidden',
  },
  cardDates: {
    fontSize: 12,
    lineHeight: 16,
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  panelText: {
    flex: 1,
    gap: Spacing.half,
  },
  zoom: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
