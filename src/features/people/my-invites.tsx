import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Card, ConfirmButton, ErrorMessage, Hint, SectionHeading } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
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

export function MyInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ invites: Invite[] }>('/api/invites');
      setInvites(result.invites);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  // Reloads when coming back from the tree, where new invites are created
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const revoke = async (id: string) => {
    setError(null);
    try {
      await api(`/api/invites/${id}`, { method: 'DELETE' });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  if (invites.length === 0 && !error) return null;

  return (
    <>
      <SectionHeading>Your invites</SectionHeading>
      <ErrorMessage message={error} />
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
