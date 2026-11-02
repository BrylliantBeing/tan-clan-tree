import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorMessage, Field, Heading, Hint, Screen } from '@/components/form';
import { useSession } from '@/features/session/session-context';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage } from '@/lib/api';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { refresh } = useSession();
  const [password, setPassword] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const submit = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, password } });
      // Resetting ends every session for the account, including one in this browser
      await refresh();
      setIsDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>Choose a new password</Heading>
      {isDone ? (
        <>
          <Hint>Your password has been changed.</Hint>
          <Link href="/sign-in" style={{ color: theme.accent }}>
            Go to sign in
          </Link>
        </>
      ) : (
        <>
          <Field
            label="New password"
            hint="At least 10 characters."
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            onSubmitEditing={submit}
          />
          <ErrorMessage message={error} />
          <Button label="Save new password" busy={isBusy} onPress={submit} />
        </>
      )}
    </Screen>
  );
}
