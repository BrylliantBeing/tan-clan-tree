import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';

import { Button, ErrorMessage } from '@/components/form';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { SessionProvider, useSession } from '@/features/session/session-context';

function RootNavigator() {
  const { status, loadFailed, refresh } = useSession();

  if (status === 'loading') {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </ThemedView>
    );
  }

  if (loadFailed) {
    return (
      <ThemedView style={styles.center}>
        <View style={styles.retry}>
          <ErrorMessage message="Could not reach the family tree. Please check your connection." />
          <Button label="Try again" onPress={refresh} />
        </View>
      </ThemedView>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'approved'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'pending'}>
        <Stack.Screen name="pending" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      {/* Reachable in any state, because they are opened from a link */}
      <Stack.Screen name="invite/[token]" />
      <Stack.Screen name="reset-password/[token]" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  retry: {
    gap: Spacing.three,
    maxWidth: 400,
  },
});
