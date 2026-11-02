import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Choice,
  ConfirmButton,
  ErrorMessage,
  Heading,
  Hint,
  PersonPicker,
  Screen,
  SectionHeading,
} from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { InviteLinkCard } from '@/features/people/invite-link-card';
import { PersonEditor } from '@/features/people/person-editor';
import { PhotoEditor } from '@/features/people/photo-editor';
import { useSession } from '@/features/session/session-context';
import { type ParentKind } from '@/features/tree/graph';
import {
  childrenOf,
  isAdoptiveLink,
  parentsOf,
  type Person,
  spousesOf,
  type TreeData,
  useTree,
} from '@/features/tree/use-tree';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage } from '@/lib/api';

function AdminControls({
  person,
  tree,
  onChanged,
}: {
  person: Person;
  tree: TreeData;
  onChanged: () => Promise<void>;
}) {
  const [relationType, setRelationType] = useState<'spouse' | 'parent' | 'adoptiveParent' | 'child' | 'adoptedChild'>(
    'spouse'
  );
  const [otherId, setOtherId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setIsBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  const relationships = (
    method: 'POST' | 'DELETE',
    type: 'spouse' | 'parent',
    firstId: string,
    secondId: string,
    kind: ParentKind = 'birth'
  ) => api('/api/admin/relationships', { method, body: { type, firstId, secondId, kind } });

  const addRelationship = () =>
    run(async () => {
      if (!otherId) return;
      if (relationType === 'spouse') await relationships('POST', 'spouse', person.id, otherId);
      if (relationType === 'parent') await relationships('POST', 'parent', otherId, person.id);
      if (relationType === 'adoptiveParent') await relationships('POST', 'parent', otherId, person.id, 'adoptive');
      if (relationType === 'child') await relationships('POST', 'parent', person.id, otherId);
      if (relationType === 'adoptedChild') await relationships('POST', 'parent', person.id, otherId, 'adoptive');
      setOtherId(null);
    });

  const others = tree.people.filter((other) => other.id !== person.id);
  const parents = parentsOf(tree, person.id);
  const isAdopted = parents.some((parent) => isAdoptiveLink(tree, parent.id, person.id));
  const parentLabel = (parent: Person) => {
    if (isAdoptiveLink(tree, parent.id, person.id)) return 'Adoptive parent';
    return isAdopted ? 'Birth parent' : 'Parent';
  };
  const existing = [
    ...spousesOf(tree, person.id).map((other) => ({
      other,
      label: 'Spouse',
      remove: () => relationships('DELETE', 'spouse', person.id, other.id),
    })),
    ...parents.map((other) => ({
      other,
      label: parentLabel(other),
      remove: () => relationships('DELETE', 'parent', other.id, person.id),
    })),
    ...childrenOf(tree, person.id).map((other) => ({
      other,
      label: isAdoptiveLink(tree, person.id, other.id) ? 'Adopted child' : 'Child',
      remove: () => relationships('DELETE', 'parent', person.id, other.id),
    })),
  ];

  return (
    <Card>
      <SectionHeading>Admin: relationships</SectionHeading>
      {existing.map(({ other, label, remove }) => (
        <View key={`${label}-${other.id}`} style={styles.relationRow}>
          <ThemedText type="small">{`${label}: ${other.fullName}`}</ThemedText>
          <ConfirmButton label="Remove" confirmLabel="Remove link" busy={isBusy} onConfirm={() => run(remove)} />
        </View>
      ))}
      <Choice
        label={`Add someone as ${person.fullName}'s`}
        options={[
          { value: 'spouse', label: 'Spouse' },
          { value: 'parent', label: 'Parent' },
          { value: 'adoptiveParent', label: 'Adoptive parent' },
          { value: 'child', label: 'Child' },
          { value: 'adoptedChild', label: 'Adopted child' },
        ]}
        value={relationType}
        onChange={setRelationType}
      />
      <PersonPicker label="Person" people={others} selectedId={otherId} onSelect={setOtherId} />
      <Button label="Add relationship" busy={isBusy} disabled={!otherId} onPress={addRelationship} />

      {person.hasAccount && !person.isDeceased ? (
        <>
          <SectionHeading>Admin: role</SectionHeading>
          <Hint>{person.role === 'admin' ? 'This person is an admin.' : 'This person is a regular member.'}</Hint>
          <Button
            label={person.role === 'admin' ? 'Remove admin role' : 'Make admin'}
            variant="secondary"
            busy={isBusy}
            onPress={() =>
              run(() =>
                api(`/api/admin/roles/${person.id}`, {
                  method: 'PUT',
                  body: { role: person.role === 'admin' ? 'member' : 'admin' },
                })
              )
            }
          />
        </>
      ) : null}
      <ErrorMessage message={error} />
    </Card>
  );
}

function LoginLinkCreator({ person }: { person: Person }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const createLink = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const result = await api<{ url: string }>('/api/admin/claim-invites', {
        method: 'POST',
        body: { personId: person.id },
      });
      setUrl(result.url);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeading>Admin: login</SectionHeading>
      <Hint>
        {`${person.fullName} has no login yet. Whoever opens this link can sign in as them right away, so send it only to them. Creating a new link cancels any older one.`}
      </Hint>
      <ErrorMessage message={error} />
      <Button label="Create login link" variant="secondary" busy={isBusy} onPress={createLink} />
      {url ? <InviteLinkCard url={url} /> : null}
    </Card>
  );
}

function RemovePerson({ person }: { person: Person }) {
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const remove = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await api(`/api/people/${person.id}`, { method: 'DELETE' });
      router.dismissTo('/');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeading>Admin: remove from tree</SectionHeading>
      <Hint>
        {`This permanently deletes ${person.fullName}'s profile, photo, login and invite links, and can't be undone. Their relatives stay in the tree, but anyone connected only through them will appear as a separate group.`}
      </Hint>
      <ErrorMessage message={error} />
      <ConfirmButton label="Remove from tree" confirmLabel="Remove permanently" busy={isBusy} onConfirm={remove} />
    </Card>
  );
}

// Only admins can open this screen. Everyone edits their own details from the Profile tab.
export default function PersonScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, refresh } = useSession();
  const { tree, error, reload } = useTree();

  const person = tree?.people.find((candidate) => candidate.id === id);

  if (!tree) {
    return (
      <Screen>
        <ErrorMessage message={error} />
        {error ? null : <ActivityIndicator accessibilityLabel="Loading profile" />}
      </Screen>
    );
  }

  if (!person) {
    return (
      <Screen>
        <Heading>Person not found</Heading>
        <Link href="/" style={{ color: theme.accent }}>
          Back to the tree
        </Link>
      </Screen>
    );
  }

  const isSelf = user?.personId === person.id;
  const afterChange = async () => {
    await reload();
    // Editing yourself can change your name, role or whether you can still sign in
    if (isSelf) await refresh();
  };

  return (
    <Screen>
      <Heading>{person.fullName}</Heading>
      {!person.hasAccount ? <Hint>This profile is managed by an admin.</Hint> : null}
      <Card>
        <PhotoEditor person={person} onChanged={reload} />
      </Card>
      <Card>
        <SectionHeading>Edit details</SectionHeading>
        <PersonEditor key={person.id} person={person} isAdmin showStatus onSaved={afterChange} />
      </Card>
      {!person.hasAccount && !person.isDeceased ? <LoginLinkCreator key={person.id} person={person} /> : null}
      <AdminControls person={person} tree={tree} onChanged={afterChange} />
      {!isSelf ? <RemovePerson key={person.id} person={person} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  relationRow: {
    gap: Spacing.two,
  },
});
