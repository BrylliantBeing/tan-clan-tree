import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Card, ConfirmButton, ErrorMessage, Heading, Hint, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { formatDate, RELATION_LABELS } from '@/lib/format';

type Approval = {
  id: string;
  fullName: string;
  birthDate: string | null;
  deathDate: string | null;
  isDeceased: boolean;
  facebookUrl: string | null;
  email: string | null;
  addedBy: string | null;
  relations: { relation: keyof typeof RELATION_LABELS; relativeName: string }[];
};

export default function AdminScreen() {
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ approvals: Approval[] }>('/api/admin/approvals');
      setApprovals(result.approvals);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const review = async (id: string, method: 'POST' | 'DELETE') => {
    setBusyId(id);
    setError(null);
    try {
      await api(`/api/admin/approvals/${id}`, { method });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <Heading>Waiting for approval</Heading>
      <ErrorMessage message={error} />
      {approvals === null && !error ? <ActivityIndicator accessibilityLabel="Loading approvals" /> : null}
      {approvals?.length === 0 ? <Hint>Nothing is waiting for review.</Hint> : null}
      {approvals?.map((approval) => (
        <Card key={approval.id}>
          <ThemedText type="smallBold">{approval.fullName}</ThemedText>
          {approval.relations.map((relation) => (
            <ThemedText key={`${relation.relation}-${relation.relativeName}`} type="small">
              {`${RELATION_LABELS[relation.relation]} of ${relation.relativeName}`}
            </ThemedText>
          ))}
          <Hint>{`Born: ${formatDate(approval.birthDate)}`}</Hint>
          {approval.isDeceased ? <Hint>{`Deceased: ${formatDate(approval.deathDate)}`}</Hint> : null}
          {approval.email ? <Hint>{`Email: ${approval.email}`}</Hint> : <Hint>No login (admin-managed profile)</Hint>}
          {approval.facebookUrl ? <Hint>{`Facebook: ${approval.facebookUrl}`}</Hint> : null}
          {approval.addedBy ? <Hint>{`Added by ${approval.addedBy}`}</Hint> : null}
          <View style={styles.actions}>
            <Button label="Approve" busy={busyId === approval.id} onPress={() => review(approval.id, 'POST')} />
            <ConfirmButton
              label="Reject"
              confirmLabel="Reject this person"
              busy={busyId === approval.id}
              onConfirm={() => review(approval.id, 'DELETE')}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
