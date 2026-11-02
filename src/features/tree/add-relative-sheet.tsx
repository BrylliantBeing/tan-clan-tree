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

import { Button, Choice, DateField, ErrorMessage, Field, GenderChoice, type GenderValue, Hint } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { InviteLinkCard } from '@/features/people/invite-link-card';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage } from '@/lib/api';

import { type Zone } from './hit-zones';
import { isAdoptiveLink, parentsOf, type Person, spousesOf, type TreeData } from './use-tree';

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
  const [gender, setGender] = useState<GenderValue>('');
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
        body: { ...relation, fullName, gender, birthDate, deathDate, facebookUrl },
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
      <GenderChoice value={gender} onChange={setGender} />
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

function AdminAddForm({ relation, onAdded }: { relation: Relation; onAdded: (id: string) => Promise<void> }) {
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<GenderValue>('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [isDeceased, setIsDeceased] = useState(false);
  const [deathDate, setDeathDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const submit = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>('/api/admin/people', {
        method: 'POST',
        body: {
          ...relation,
          fullName,
          gender,
          birthDate,
          facebookUrl,
          phone: isDeceased ? '' : phone,
          isDeceased,
          deathDate: isDeceased ? deathDate : '',
        },
      });
      await onAdded(id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <Hint>They join the tree right away. Only the name is required.</Hint>
      <Field label="Full name" value={fullName} onChangeText={setFullName} />
      <GenderChoice value={gender} onChange={setGender} />
      <Choice
        label="Status"
        options={[
          { value: 'living', label: 'Living' },
          { value: 'deceased', label: 'Deceased' },
        ]}
        value={isDeceased ? 'deceased' : 'living'}
        onChange={(value) => setIsDeceased(value === 'deceased')}
      />
      <DateField label="Birthdate (optional)" value={birthDate} onChangeText={setBirthDate} />
      {isDeceased ? (
        <DateField label="Date of death (optional)" value={deathDate} onChangeText={setDeathDate} />
      ) : (
        <Field
          label="Contact number (optional)"
          placeholder="+63 917 123 4567"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          hint="Everyone in the family tree can see this."
        />
      )}
      <Field
        label="Facebook link (optional)"
        placeholder="https://facebook.com/their.name"
        value={facebookUrl}
        onChangeText={setFacebookUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <ErrorMessage message={error} />
      <Button label="Add to the tree" busy={isBusy} onPress={submit} />
    </>
  );
}

const INITIAL_RELATION: Record<AddZone, RelationType> = { top: 'parent', bottom: 'child', side: 'spouse' };

type Mode = 'details' | 'invite' | 'deceased';

const ADMIN_MODES: { value: Mode; label: string }[] = [
  { value: 'details', label: 'Enter their details' },
  { value: 'invite', label: 'Send an invite link' },
];

const MEMBER_MODES: { value: Mode; label: string }[] = [
  { value: 'invite', label: 'Living' },
  { value: 'deceased', label: 'Deceased' },
];

export function AddRelativeSheet({
  tree,
  person,
  zone,
  isAdmin,
  onAdded,
  onClose,
}: {
  tree: TreeData;
  person: Person;
  zone: AddZone;
  isAdmin: boolean;
  onAdded: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const spouses = spousesOf(tree, person.id);
  const parents = parentsOf(tree, person.id);
  const [relationType, setRelationType] = useState(INITIAL_RELATION[zone]);
  const [mode, setMode] = useState<Mode>(isAdmin ? 'details' : 'invite');
  // With one spouse, they are almost always the other parent. With several, it has to be a real choice.
  const [otherParentId, setOtherParentId] = useState(spouses.length === 1 ? spouses[0].id : NO_OTHER_PARENT);

  const relation: Relation = {
    relationType,
    relativeId: person.id,
    otherParentId: relationType === 'child' && otherParentId !== NO_OTHER_PARENT ? otherParentId : null,
  };
  const birthParents = parents.filter((parent) => !isAdoptiveLink(tree, parent.id, person.id));
  const hasTwoParents = relationType === 'parent' && birthParents.length >= 2;
  const needsParentFirst = relationType === 'sibling' && parents.length === 0;
  const isSiblingOfAdopted = relationType === 'sibling' && birthParents.length < parents.length;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { backgroundColor: theme.scrim }, width >= WIDE_SCREEN ? styles.backdropWide : null]}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, width >= WIDE_SCREEN ? styles.sheetWide : null]}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <ThemedText type="name" role="heading" style={styles.title}>
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

            {isSiblingOfAdopted ? (
              <Hint>{`${person.fullName} was adopted, so add this sibling from the card of the parent they share.`}</Hint>
            ) : null}

            {!hasTwoParents && !needsParentFirst && !isSiblingOfAdopted ? (
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
                  label={isAdmin ? 'How do you want to add them?' : 'Are they living?'}
                  options={isAdmin ? ADMIN_MODES : MEMBER_MODES}
                  value={mode}
                  onChange={setMode}
                />
                {mode === 'details' ? <AdminAddForm relation={relation} onAdded={onAdded} /> : null}
                {/* The key starts a fresh form, so a finished one doesn't carry over to a different choice */}
                {mode === 'invite' ? <InviteForm key={JSON.stringify(relation)} relation={relation} /> : null}
                {mode === 'deceased' ? <DeceasedForm key={JSON.stringify(relation)} relation={relation} /> : null}
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
  },
  backdropWide: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: Radius.medium,
    borderTopRightRadius: Radius.medium,
    overflow: 'hidden',
  },
  sheetWide: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Radius.medium,
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
