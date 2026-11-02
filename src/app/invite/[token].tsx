import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button, DateField, ErrorMessage, Field, Heading, Hint, Screen } from '@/components/form';
import { useSession } from '@/features/session/session-context';
import { api, errorMessage } from '@/lib/api';
import { RELATION_LABELS } from '@/lib/format';

type InvitePreview = {
  inviterName: string;
  relativeName: string;
  relationType: keyof typeof RELATION_LABELS;
};

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { refresh } = useSession();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    api<{ invite: InvitePreview }>(`/api/invite-links/${encodeURIComponent(token)}`)
      .then((result) => setInvite(result.invite))
      .catch((caught) => setLoadError(errorMessage(caught)));
  }, [token]);

  const submit = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await api(`/api/invite-links/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: { fullName, birthDate, facebookUrl, email, password },
      });
      await refresh();
      router.replace('/pending');
    } catch (caught) {
      setError(errorMessage(caught));
      setIsBusy(false);
    }
  };

  if (loadError) {
    return (
      <Screen>
        <Heading>This invite can't be used</Heading>
        <ErrorMessage message={loadError} />
        <Hint>Please ask your relative for a new link.</Hint>
      </Screen>
    );
  }

  if (!invite) {
    return (
      <Screen>
        <ActivityIndicator accessibilityLabel="Loading invite" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading>Join the Tan Family Tree</Heading>
      <Hint>
        {`${invite.inviterName} invited you to join as the ${RELATION_LABELS[invite.relationType]} of ${invite.relativeName}. An admin will review your details before you can see the tree.`}
      </Hint>
      <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" />
      <DateField label="Birthdate (optional)" value={birthDate} onChangeText={setBirthDate} />
      <Field
        label="Facebook link (optional)"
        placeholder="https://facebook.com/your.name"
        value={facebookUrl}
        onChangeText={setFacebookUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
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
        hint="At least 10 characters."
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <ErrorMessage message={error} />
      <Button label="Create my account" busy={isBusy} onPress={submit} />
    </Screen>
  );
}
