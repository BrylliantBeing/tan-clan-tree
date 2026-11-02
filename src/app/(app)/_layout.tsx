import { type Href, Link, Stack, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/features/session/session-context';

function NavLink({ href, label }: { href: Href & string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link href={href} asChild>
      <Pressable role="link" style={styles.navLink}>
        <ThemedView type={isActive ? 'backgroundSelected' : 'backgroundElement'} style={styles.navLinkInner}>
          <ThemedText type="small" themeColor={isActive ? 'text' : 'textSecondary'}>
            {label}
          </ThemedText>
        </ThemedView>
      </Pressable>
    </Link>
  );
}

export default function AppLayout() {
  const { user, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const isAdmin = user?.role === 'admin';

  return (
    <View style={styles.fill}>
      <ThemedView type="backgroundElement" style={[styles.nav, { paddingTop: insets.top + Spacing.two }]}>
        <NavLink href="/" label="Tree" />
        <NavLink href="/add" label="Add" />
        {isAdmin ? <NavLink href="/admin" label="Admin" /> : null}
        <Pressable role="button" onPress={signOut} style={[styles.navLink, styles.signOut]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.navLinkInner}>
            Sign out
          </ThemedText>
        </Pressable>
      </ThemedView>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="add" />
        <Stack.Screen name="person/[id]" />
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="admin" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  navLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  navLinkInner: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  signOut: {
    marginLeft: 'auto',
  },
});
