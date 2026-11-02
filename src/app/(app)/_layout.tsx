import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSession } from '@/features/session/session-context';

export const unstable_settings = {
  // Gives the admin pages a way back to the tree when they are opened directly
  anchor: '(tabs)',
};

export default function AppLayout() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';

  return (
    <GestureHandlerRootView style={styles.fill}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="person/[id]" options={{ headerShown: true, title: 'Manage person' }} />
          <Stack.Screen name="admin" options={{ headerShown: true, title: 'Approvals' }} />
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
