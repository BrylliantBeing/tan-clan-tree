import { Lora_600SemiBold } from '@expo-google-fonts/lora/600SemiBold';
import { SourceSans3_400Regular } from '@expo-google-fonts/source-sans-3/400Regular';
import { SourceSans3_600SemiBold } from '@expo-google-fonts/source-sans-3/600SemiBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, useColorScheme, View } from 'react-native';

import { Button, ErrorMessage } from '@/components/form';
import { ThemedView } from '@/components/themed-view';
import { Colors, FontFaces, Spacing } from '@/constants/theme';
import { SessionProvider, useSession } from '@/features/session/session-context';

const IS_WEB = Platform.OS === 'web';

if (!IS_WEB) SplashScreen.preventAutoHideAsync();

const LIGHT_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.accent,
    background: Colors.light.background,
    card: Colors.light.backgroundElement,
    text: Colors.light.text,
    border: Colors.light.border,
  },
};

const DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.accent,
    background: Colors.dark.background,
    card: Colors.dark.backgroundElement,
    text: Colors.dark.text,
    border: Colors.dark.border,
  },
};

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
  const [fontsLoaded, fontError] = useFonts({
    [FontFaces.serif]: Lora_600SemiBold,
    [FontFaces.sans]: SourceSans3_400Regular,
    [FontFaces.sansBold]: SourceSans3_600SemiBold,
  });
  // A font that fails to load shouldn't lock anyone out, so carry on with the system fonts
  const fontsSettled = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (!IS_WEB && fontsSettled) SplashScreen.hide();
  }, [fontsSettled]);

  // The web has fallback fonts in global.css and no splash screen to wait behind
  if (!IS_WEB && !fontsSettled) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DARK_THEME : LIGHT_THEME}>
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
