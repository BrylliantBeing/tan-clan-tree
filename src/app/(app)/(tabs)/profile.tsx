import { Link } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { Button, Card, ErrorMessage, Heading, Hint, Screen, SectionHeading } from '@/components/form';
import { MyInvites } from '@/features/people/my-invites';
import { PersonEditor } from '@/features/people/person-editor';
import { PhotoEditor } from '@/features/people/photo-editor';
import { useSession } from '@/features/session/session-context';
import { useTree } from '@/features/tree/use-tree';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, refresh, signOut } = useSession();
  const { tree, error, reload } = useTree();
  const person = tree?.people.find((candidate) => candidate.id === user?.personId);

  if (!user || !person) {
    return (
      <Screen>
        <ErrorMessage message={error} />
        {error ? null : <ActivityIndicator accessibilityLabel="Loading your profile" />}
      </Screen>
    );
  }

  const isAdmin = user.role === 'admin';
  const afterSave = async () => {
    await reload();
    // Your name appears in the session too
    await refresh();
  };

  return (
    <Screen>
      <Heading>Your profile</Heading>
      <Hint>{`Signed in as ${user.email}`}</Hint>
      <Card>
        <PhotoEditor person={person} onChanged={reload} />
      </Card>
      <Card>
        <PersonEditor key={person.id} person={person} isAdmin={isAdmin} onSaved={afterSave} />
      </Card>
      <MyInvites />
      {isAdmin ? (
        <>
          <SectionHeading>Admin</SectionHeading>
          <Link href="/admin" style={{ color: theme.accent }}>
            Review additions waiting for approval
          </Link>
        </>
      ) : null}
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
