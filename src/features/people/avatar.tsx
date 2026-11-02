import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { initialsOf } from '@/lib/format';

type AvatarPerson = { id: string; fullName: string; photoVersion: number | null };

const MAT_WIDTH = 2;
// Corner tabs can't be made out on anything smaller, like the cards in the tree
const SMALLEST_WITH_TABS = 64;

function CornerTabs({ size, color }: { size: number; color: string }) {
  const tab = Math.round(size * 0.18);
  const far = size - tab;
  return (
    <Svg width={size} height={size} style={styles.tabs} pointerEvents="none">
      <Path
        d={`M0 0H${tab}L0 ${tab}Z M${size} 0V${tab}L${far} 0Z M0 ${size}V${far}L${tab} ${size}Z M${size} ${size}H${far}L${size} ${far}Z`}
        fill={color}
      />
    </Svg>
  );
}

export function Avatar({ person, size }: { person: AvatarPerson; size: number }) {
  const theme = useTheme();
  const frame = {
    width: size,
    height: size,
    backgroundColor: theme.backgroundElement,
    borderColor: theme.border,
  };

  return (
    <View style={[styles.frame, frame]}>
      {person.photoVersion !== null ? (
        <Image
          source={{ uri: `/api/people/${person.id}/photo?v=${person.photoVersion}` }}
          style={[styles.picture, { backgroundColor: theme.backgroundSelected }]}
          contentFit="cover"
          accessibilityLabel={`Photo of ${person.fullName}`}
        />
      ) : (
        <View style={[styles.picture, styles.initials, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="name" style={{ fontSize: size * 0.34, lineHeight: size * 0.5 }}>
            {initialsOf(person.fullName)}
          </ThemedText>
        </View>
      )}
      {size >= SMALLEST_WITH_TABS ? <CornerTabs size={size} color={theme.treeLine} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    padding: MAT_WIDTH,
    borderWidth: 1,
    borderRadius: Radius.small,
  },
  picture: {
    flex: 1,
    borderRadius: Radius.small / 2,
  },
  initials: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    position: 'absolute',
    left: -1,
    top: -1,
  },
});
