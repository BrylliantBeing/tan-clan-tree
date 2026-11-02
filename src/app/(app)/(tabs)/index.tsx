import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button, ErrorMessage } from '@/components/form';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/features/session/session-context';
import { TreeView } from '@/features/tree/tree-view';
import { useTree } from '@/features/tree/use-tree';

export default function TreeScreen() {
  const { user } = useSession();
  const { tree, error, reload } = useTree();

  if (!tree || !user) {
    return (
      <ThemedView style={styles.center}>
        {error ? (
          <>
            <ErrorMessage message={error} />
            <Button label="Try again" onPress={reload} />
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading family tree" />
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <TreeView tree={tree} selfId={user.personId} onTreeChanged={reload} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
});
