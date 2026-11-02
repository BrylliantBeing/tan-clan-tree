import { useState } from 'react';

import { Button, Choice, DateField, ErrorMessage, Field, Hint } from '@/components/form';
import { type Person } from '@/features/tree/use-tree';
import { api, errorMessage } from '@/lib/api';

export function PersonEditor({
  person,
  isAdmin,
  showStatus = false,
  onSaved,
}: {
  person: Person;
  isAdmin: boolean;
  // Living or deceased is only changed from the admin's manage page, even when editing yourself
  showStatus?: boolean;
  onSaved: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState(person.fullName);
  const [birthDate, setBirthDate] = useState(person.birthDate ?? '');
  const [phone, setPhone] = useState(person.phone ?? '');
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
      const details = { fullName, birthDate, facebookUrl, phone };
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
    <>
      <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" />
      <DateField label="Birthdate" value={birthDate} onChangeText={setBirthDate} />
      <Field
        label="Contact number"
        placeholder="+63 917 123 4567"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        hint="Everyone in the family tree can see this."
      />
      <Field
        label="Facebook link"
        placeholder="https://facebook.com/name"
        value={facebookUrl}
        onChangeText={setFacebookUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      {showStatus ? (
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
    </>
  );
}
