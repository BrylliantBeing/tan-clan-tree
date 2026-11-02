import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Choice,
  ConfirmButton,
  DateField,
  ErrorMessage,
  Field,
  Heading,
  Hint,
  Screen,
  SectionHeading,
} from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { InviteLinkCard } from '@/features/people/invite-link-card';
import { RelationPicker, type RelationValue } from '@/features/people/relation-picker';
import { useSession } from '@/features/session/session-context';
import { useTree } from '@/features/tree/use-tree';
import { api, errorMessage } from '@/lib/api';
import { RELATION_LABELS } from '@/lib/format';

type Invite = {
  id: string;
  relationType: keyof typeof RELATION_LABELS | null;
  relativeName: string | null;
  claimName: string | null;
  claimedName: string | null;
  status: 'active' | 'claimed' | 'revoked' | 'expired';
};

async function fetchInvites() {
  const { invites } = await api<{ invites: Invite[] }>('/api/invites');
  return invites;
}

function InviteForm({ relation }: { relation: RelationValue }) {
  const [url, setUrl] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const loadInvites = useCallback(
    () =>
      fetchInvites()
        .then(setInvites)
        .catch((caught) => setError(errorMessage(caught))),
    []
  );

  useEffect(() => {
    fetchInvites()
      .then(setInvites)
      .catch((caught) => setError(errorMessage(caught)));
  }, []);

  const createLink = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const result = await api<{ url: string }>('/api/invites', { method: 'POST', body: relation });
      setUrl(result.url);
      await loadInvites();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await api(`/api/invites/${id}`, { method: 'DELETE' });
      await loadInvites();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <>
      <Hint>The person you invite fills in their own details. An admin then reviews the addition.</Hint>
      <ErrorMessage message={error} />
      <Button label="Create invite link" busy={isBusy} disabled={!relation.relativeId} onPress={createLink} />
      {url ? <InviteLinkCard url={url} /> : null}

      {invites.length > 0 ? <SectionHeading>Your invites</SectionHeading> : null}
      {invites.map((invite) => (
        <Card key={invite.id}>
          <ThemedText type="small">
            {invite.relationType
              ? `${RELATION_LABELS[invite.relationType]} of ${invite.relativeName}`
              : `Login for ${invite.claimName}`}
            {invite.relationType && invite.claimedName ? `: ${invite.claimedName}` : ''}
          </ThemedText>
          <Hint>{invite.status}</Hint>
          {invite.status === 'active' ? (
            <ConfirmButton label="Revoke" confirmLabel="Revoke this link" onConfirm={() => revoke(invite.id)} />
          ) : null}
        </Card>
      ))}
    </>
  );
}

function DeceasedForm({ relation, onAdded }: { relation: RelationValue; onAdded: () => void }) {
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const submit = async () => {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api('/api/people', {
        method: 'POST',
        body: { ...relation, fullName, birthDate, deathDate, facebookUrl },
      });
      setMessage(`${fullName} was sent to an admin for approval.`);
      setFullName('');
      setBirthDate('');
      setDeathDate('');
      setFacebookUrl('');
      onAdded();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <Hint>Leave a date blank if you don’t know it. Once approved, an admin looks after this profile.</Hint>
      <Field label="Full name" value={fullName} onChangeText={setFullName} />
      <DateField label="Birthdate (optional)" value={birthDate} onChangeText={setBirthDate} />
      <DateField label="Date of death (optional)" value={deathDate} onChangeText={setDeathDate} />
      <Field
        label="Facebook link (optional)"
        placeholder="https://facebook.com/their.name"
        value={facebookUrl}
        onChangeText={setFacebookUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <ErrorMessage message={error} />
      {message ? <Hint>{message}</Hint> : null}
      <Button label="Send for approval" busy={isBusy} disabled={!relation.relativeId} onPress={submit} />
    </>
  );
}

export default function AddScreen() {
  const { user } = useSession();
  const { tree, error, reload } = useTree();
  const [mode, setMode] = useState<'invite' | 'deceased'>('invite');
  const [relation, setRelation] = useState<RelationValue>({
    relationType: 'child',
    relativeId: user?.personId ?? null,
    otherParentId: null,
  });

  if (!tree) {
    return (
      <Screen>
        <ErrorMessage message={error} />
        {error ? null : <ActivityIndicator accessibilityLabel="Loading" />}
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading>Add to the family tree</Heading>
      <Choice
        label="Who are you adding?"
        options={[
          { value: 'invite', label: 'A living relative' },
          { value: 'deceased', label: 'A deceased relative' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={styles.section}>
        <RelationPicker tree={tree} value={relation} onChange={setRelation} />
      </View>
      {mode === 'invite' ? (
        <InviteForm relation={relation} />
      ) : (
        <DeceasedForm relation={relation} onAdded={reload} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
});
