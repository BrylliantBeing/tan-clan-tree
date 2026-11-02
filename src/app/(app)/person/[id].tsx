import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
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
  PersonPicker,
  Screen,
  SectionHeading,
} from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { InviteLinkCard } from '@/features/people/invite-link-card';
import { useSession } from '@/features/session/session-context';
import { childrenOf, parentsOf, type Person, spousesOf, type TreeData, useTree } from '@/features/tree/use-tree';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

function PersonEditor({
  person,
  isAdmin,
  onSaved,
}: {
  person: Person;
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState(person.fullName);
  const [birthDate, setBirthDate] = useState(person.birthDate ?? '');
  const [facebookUrl, setFacebookUrl] = useState(person.facebookUrl ?? '');
  const [isDeceased, setIsDeceased] = useState(person.isDeceased);
  const [deathDate, setDeathDate] = useState(person.deathDate ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const save = async () => {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const details = { fullName, birthDate, facebookUrl };
      await api(`/api/people/${person.id}`, {
        method: 'PATCH',
        body: isAdmin ? { ...details, isDeceased, deathDate: isDeceased ? deathDate : null } : details,
      });
      setMessage('Saved.');
      await onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeading>Edit details</SectionHeading>
      <Field label="Full name" value={fullName} onChangeText={setFullName} />
      <DateField label="Birthdate" value={birthDate} onChangeText={setBirthDate} />
      <Field
        label="Facebook link"
        placeholder="https://facebook.com/name"
        value={facebookUrl}
        onChangeText={setFacebookUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      {isAdmin ? (
        <>
          <Choice
            label="Status"
            options={[
              { value: 'living', label: 'Living' },
              { value: 'deceased', label: 'Deceased' },
            ]}
            value={isDeceased ? 'deceased' : 'living'}
            onChange={(value) => setIsDeceased(value === 'deceased')}
          />
          {isDeceased ? (
            <>
              <DateField label="Date of death" value={deathDate} onChangeText={setDeathDate} />
              {person.hasAccount && !person.isDeceased ? (
                <Hint>Saving will disable this person’s login and sign them out everywhere.</Hint>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      <ErrorMessage message={error} />
      {message ? <Hint>{message}</Hint> : null}
      <Button label="Save" busy={isBusy} onPress={save} />
    </Card>
  );
}

function AdminControls({
  person,
  tree,
  onChanged,
}: {
  person: Person;
  tree: TreeData;
  onChanged: () => Promise<void>;
}) {
  const [relationType, setRelationType] = useState<'spouse' | 'parent' | 'child'>('spouse');
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

  const relationships = (method: 'POST' | 'DELETE', type: 'spouse' | 'parent', firstId: string, secondId: string) =>
    api('/api/admin/relationships', { method, body: { type, firstId, secondId } });

  const addRelationship = () =>
    run(async () => {
      if (!otherId) return;
      if (relationType === 'spouse') await relationships('POST', 'spouse', person.id, otherId);
      if (relationType === 'parent') await relationships('POST', 'parent', otherId, person.id);
      if (relationType === 'child') await relationships('POST', 'parent', person.id, otherId);
      setOtherId(null);
    });

  const others = tree.people.filter((other) => other.id !== person.id);
  const existing = [
    ...spousesOf(tree, person.id).map((other) => ({
      other,
      label: 'Spouse',
      remove: () => relationships('DELETE', 'spouse', person.id, other.id),
    })),
    ...parentsOf(tree, person.id).map((other) => ({
      other,
      label: 'Parent',
      remove: () => relationships('DELETE', 'parent', other.id, person.id),
    })),
    ...childrenOf(tree, person.id).map((other) => ({
      other,
      label: 'Child',
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
          { value: 'child', label: 'Child' },
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

function FamilyList({ label, people }: { label: string; people: Person[] }) {
  const theme = useTheme();
  if (people.length === 0) return null;
  return (
    <View>
      <ThemedText type="smallBold">{label}</ThemedText>
      {people.map((person) => (
        <Link
          key={person.id}
          href={{ pathname: '/person/[id]', params: { id: person.id } }}
          style={[styles.familyLink, { color: theme.accent }]}>
          {person.fullName}
        </Link>
      ))}
    </View>
  );
}

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

  const isAdmin = user?.role === 'admin';
  const isSelf = user?.personId === person.id;
  const afterChange = async () => {
    await reload();
    // Editing yourself can change your name, role or whether you can still sign in
    if (isSelf) await refresh();
  };

  return (
    <Screen>
      <Heading>{person.fullName}</Heading>
      <Card>
        <ThemedText type="small">{`Born: ${formatDate(person.birthDate)}`}</ThemedText>
        {person.isDeceased ? <ThemedText type="small">{`Died: ${formatDate(person.deathDate)}`}</ThemedText> : null}
        {person.facebookUrl ? (
          <ExternalLink href={person.facebookUrl as never} style={{ color: theme.accent }}>
            Facebook profile
          </ExternalLink>
        ) : null}
        {!person.hasAccount ? <Hint>This profile is managed by an admin.</Hint> : null}
      </Card>
      <View style={styles.family}>
        <FamilyList label="Spouses" people={spousesOf(tree, person.id)} />
        <FamilyList label="Parents" people={parentsOf(tree, person.id)} />
        <FamilyList label="Children" people={childrenOf(tree, person.id)} />
      </View>
      {isAdmin || isSelf ? (
        <PersonEditor key={person.id} person={person} isAdmin={isAdmin} onSaved={afterChange} />
      ) : null}
      {isAdmin && !person.hasAccount && !person.isDeceased ? (
        <LoginLinkCreator key={person.id} person={person} />
      ) : null}
      {isAdmin ? <AdminControls person={person} tree={tree} onChanged={afterChange} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  family: {
    gap: Spacing.three,
  },
  familyLink: {
    paddingVertical: Spacing.two,
  },
  relationRow: {
    gap: Spacing.two,
  },
});
