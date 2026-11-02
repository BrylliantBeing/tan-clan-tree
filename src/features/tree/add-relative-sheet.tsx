import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Button, Choice, DateField, ErrorMessage, Field, Hint } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { InviteLinkCard } from '@/features/people/invite-link-card';
import { api, errorMessage } from '@/lib/api';

import { type Zone } from './hit-zones';
import { parentsOf, type Person, spousesOf, type TreeData } from './use-tree';

export type AddZone = Exclude<Zone, 'card'>;

type RelationType = 'parent' | 'child' | 'spouse' | 'sibling';

type Relation = { relationType: RelationType; relativeId: string; otherParentId: string | null };

const NO_OTHER_PARENT = 'none';
const WIDE_SCREEN = 640;

function InviteForm({ relation }: { relation: Relation }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const createLink = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const result = await api<{ url: string }>('/api/invites', { method: 'POST', body: relation });
      setUrl(result.url);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  if (url) return <InviteLinkCard url={url} />;
  return (
    <>
      <Hint>The person you invite fills in their own details. An admin then reviews the addition.</Hint>
      <ErrorMessage message={error} />
      <Button label="Create invite link" busy={isBusy} onPress={createLink} />
    </>
  );
}

function DeceasedForm({ relation }: { relation: Relation }) {
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
    try {
      await api('/api/people', {
        method: 'POST',
        body: { ...relation, fullName, birthDate, deathDate, facebookUrl },
      });
      setMessage(`${fullName} was sent to an admin for approval.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  if (message) return <Hint>{message}</Hint>;
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
      <Button label="Send for approval" busy={isBusy} onPress={submit} />
    </>
  );
}

const INITIAL_RELATION: Record<AddZone, RelationType> = { top: 'parent', bottom: 'child', side: 'spouse' };

export function AddRelativeSheet({
  tree,
  person,
  zone,
  onClose,
}: {
  tree: TreeData;
  person: Person;
  zone: AddZone;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const spouses = spousesOf(tree, person.id);
  const parents = parentsOf(tree, person.id);
  const [relationType, setRelationType] = useState(INITIAL_RELATION[zone]);
  const [mode, setMode] = useState<'invite' | 'deceased'>('invite');
  // With one spouse, they are almost always the other parent. With several, it has to be a real choice.
  const [otherParentId, setOtherParentId] = useState(spouses.length === 1 ? spouses[0].id : NO_OTHER_PARENT);

  const relation: Relation = {
    relationType,
    relativeId: person.id,
    otherParentId: relationType === 'child' && otherParentId !== NO_OTHER_PARENT ? otherParentId : null,
  };
  const hasTwoParents = relationType === 'parent' && parents.length >= 2;
  const needsParentFirst = relationType === 'sibling' && parents.length === 0;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, width >= WIDE_SCREEN ? styles.backdropWide : null]}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, width >= WIDE_SCREEN ? styles.sheetWide : null]}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <ThemedText type="smallBold" role="heading" style={styles.title}>
                {`Add ${relationType} of ${person.fullName}`}
              </ThemedText>
              <Button label="Close" variant="secondary" onPress={onClose} />
            </View>

            {zone === 'side' ? (
              <Choice
                label="Who are you adding?"
                options={[
                  { value: 'spouse', label: 'Spouse' },
                  { value: 'sibling', label: 'Sibling' },
                ]}
                value={relationType}
                onChange={setRelationType}
              />
            ) : null}

            {hasTwoParents ? <Hint>{`${person.fullName} already has two parents in the tree.`}</Hint> : null}

            {needsParentFirst ? (
              <>
                <Hint>
                  {`Siblings are connected through their parents, and ${person.fullName} has no parents in the tree yet. Add a parent first.`}
                </Hint>
                <Button label="Add a parent instead" variant="secondary" onPress={() => setRelationType('parent')} />
              </>
            ) : null}

            {!hasTwoParents && !needsParentFirst ? (
              <>
                {relationType === 'child' && spouses.length > 0 ? (
                  <Choice
                    label={`Who is the other parent, alongside ${person.fullName}?`}
                    options={[
                      ...spouses.map((spouse) => ({ value: spouse.id, label: spouse.fullName })),
                      { value: NO_OTHER_PARENT, label: 'Not listed' },
                    ]}
                    value={otherParentId}
                    onChange={setOtherParentId}
                  />
                ) : null}
                <Choice
                  label="Are they living?"
                  options={[
                    { value: 'invite', label: 'Living' },
                    { value: 'deceased', label: 'Deceased' },
                  ]}
                  value={mode}
                  onChange={setMode}
                />
                {/* The key starts a fresh form, so a finished one doesn't carry over to a different choice */}
                {mode === 'invite' ? (
                  <InviteForm key={JSON.stringify(relation)} relation={relation} />
                ) : (
                  <DeceasedForm key={JSON.stringify(relation)} relation={relation} />
                )}
              </>
            ) : null}
          </ScrollView>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  backdropWide: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    overflow: 'hidden',
  },
  sheetWide: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Spacing.three,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
  },
});
