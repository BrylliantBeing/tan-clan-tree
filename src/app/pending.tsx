import { Button, Heading, Hint, Screen } from '@/components/form';
import { useSession } from '@/features/session/session-context';

export default function PendingScreen() {
  const { user, refresh, signOut } = useSession();
  return (
    <Screen>
      <Heading>Waiting for approval</Heading>
      <Hint>
        {`Thanks${user ? `, ${user.fullName}` : ''}. An admin needs to approve your details before you can see the family tree.`}
      </Hint>
      <Button label="Check again" onPress={refresh} />
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
