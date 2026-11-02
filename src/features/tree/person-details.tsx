import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, type SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ExternalLink } from '@/components/external-link';
import { Button, Hint, TextLink } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { Avatar } from '@/features/people/avatar';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/format';

import { type AddZone } from './add-relative-sheet';
import { CARD_HEIGHT, CARD_WIDTH } from './layout';
import { type Person } from './use-tree';

const POPOVER_WIDTH = 300;
const EDGE_GAP = 12;

export function PersonDetails({
  person,
  position,
  cameraX,
  cameraY,
  cameraScale,
  viewport,
  isWide,
  isSelf,
  isAdmin,
  onAdd,
  onClose,
}: {
  person: Person;
  position: { x: number; y: number };
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  cameraScale: SharedValue<number>;
  viewport: { width: number; height: number };
  isWide: boolean;
  isSelf: boolean;
  isAdmin: boolean;
  onAdd: (zone: AddZone) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const height = useSharedValue(0);

  // Sits beside the card and follows it, flipping sides and staying on screen as the tree moves
  const anchored = useAnimatedStyle(() => {
    const scale = cameraScale.get();
    const cardLeft = cameraX.get() + position.x * scale;
    const cardRight = cardLeft + CARD_WIDTH * scale;
    const cardMiddle = cameraY.get() + (position.y + CARD_HEIGHT / 2) * scale;

    const room = viewport.width - POPOVER_WIDTH - EDGE_GAP;
    const beside = cardRight + EDGE_GAP <= room ? cardRight + EDGE_GAP : cardLeft - POPOVER_WIDTH - EDGE_GAP;
    const lowest = viewport.height - height.get() - EDGE_GAP;
    return {
      transform: [
        { translateX: Math.max(EDGE_GAP, Math.min(room, beside)) },
        { translateY: Math.max(EDGE_GAP, Math.min(lowest, cardMiddle - height.get() / 2)) },
      ],
    };
  });

  const hasContact = Boolean(person.phone || person.facebookUrl);

  return (
    <Animated.View
      onLayout={(event) => height.set(event.nativeEvent.layout.height)}
      style={isWide ? [styles.popover, anchored] : styles.sheet}>
      <Animated.View entering={FadeIn.duration(120)}>
        <ThemedView
          type="backgroundElement"
          style={[
            styles.panel,
            !isWide && styles.panelSheet,
            { borderColor: theme.border, boxShadow: `0 8px 24px ${theme.shadow}` },
          ]}>
          <View style={styles.header}>
            <Avatar person={person} size={64} />
            <View style={styles.name}>
              <ThemedText type="name" role="heading" style={styles.nameText}>
                {person.fullName}
              </ThemedText>
              {isSelf ? <Hint>This is you</Hint> : null}
            </View>
            <Pressable
              role="button"
              accessibilityLabel="Close details"
              onPress={onClose}
              style={styles.close}>
              <ThemedText themeColor="textSecondary">×</ThemedText>
            </Pressable>
          </View>

          <View style={styles.rows}>
            {person.birthDate ? <ThemedText type="small">{`Born ${formatDate(person.birthDate)}`}</ThemedText> : null}
            {person.isDeceased ? (
              <ThemedText type="small">
                {person.deathDate ? `Died ${formatDate(person.deathDate)}` : 'Deceased'}
              </ThemedText>
            ) : null}
            {person.phone ? (
              <TextLink href={`tel:${person.phone.replace(/[^+0-9]/g, '')}`} style={styles.link}>
                {person.phone}
              </TextLink>
            ) : null}
            {person.facebookUrl ? (
              <ExternalLink href={person.facebookUrl as never} style={styles.link}>
                Facebook profile
              </ExternalLink>
            ) : null}
            {!hasContact && !person.isDeceased && !isSelf ? <Hint>No contact details added yet.</Hint> : null}
          </View>

          <View style={styles.actions}>
            <Button label="Add parent" variant="secondary" onPress={() => onAdd('top')} />
            <Button label="Add spouse or sibling" variant="secondary" onPress={() => onAdd('side')} />
            <Button label="Add child" variant="secondary" onPress={() => onAdd('bottom')} />
          </View>

          {isSelf ? (
            <TextLink href="/profile" style={styles.link}>
              Edit your profile
            </TextLink>
          ) : null}
          {isAdmin ? (
            <TextLink href={{ pathname: '/person/[id]', params: { id: person.id } }} style={styles.link}>
              Manage this person
            </TextLink>
          ) : null}
        </ThemedView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  popover: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: POPOVER_WIDTH,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  panel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  panelSheet: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  name: {
    flex: 1,
    gap: Spacing.half,
  },
  nameText: {
    fontSize: 18,
    lineHeight: 24,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: {
    gap: Spacing.one,
  },
  link: {
    paddingVertical: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
