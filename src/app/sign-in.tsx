import { Link } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorMessage, Field, Heading, Hint, Screen } from '@/components/form';
import { useSession } from '@/features/session/session-context';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';

export default function SignInScreen() {
  const theme = useTheme();
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const submit = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (caught) {
      setError(errorMessage(caught));
      setIsBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>Tan Family Tree</Heading>
      <Hint>This family tree is private. To join, ask a relative for an invite link.</Hint>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        onSubmitEditing={submit}
      />
      <ErrorMessage message={error} />
      <Button label="Sign in" busy={isBusy} onPress={submit} />
      <Link href="/forgot-password" style={{ color: theme.accent }}>
        Forgot your password?
      </Link>
    </Screen>
  );
}
