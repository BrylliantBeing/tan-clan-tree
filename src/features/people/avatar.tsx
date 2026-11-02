import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { initialsOf } from '@/lib/format';

type AvatarPerson = { id: string; fullName: string; photoVersion: number | null };

export function Avatar({ person, size }: { person: AvatarPerson; size: number }) {
  const theme = useTheme();
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (person.photoVersion !== null) {
    return (
      <Image
        source={{ uri: `/api/people/${person.id}/photo?v=${person.photoVersion}` }}
        style={[shape, { backgroundColor: theme.backgroundSelected }]}
        contentFit="cover"
        accessibilityLabel={`Photo of ${person.fullName}`}
      />
    );
  }
  return (
    <View style={[styles.initials, shape, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" style={{ fontSize: size * 0.36, lineHeight: size * 0.5 }}>
        {initialsOf(person.fullName)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  initials: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
