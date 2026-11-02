import { Link } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorMessage, Field, Heading, Hint, Screen } from '@/components/form';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const submit = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setIsSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>Reset your password</Heading>
      {isSent ? (
        <Hint>If that email has an account, a reset link is on its way. The link works for one hour.</Hint>
      ) : (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onSubmitEditing={submit}
          />
          <ErrorMessage message={error} />
          <Button label="Send reset link" busy={isBusy} onPress={submit} />
        </>
      )}
      <Link href="/sign-in" style={{ color: theme.accent }}>
        Back to sign in
      </Link>
    </Screen>
  );
}
