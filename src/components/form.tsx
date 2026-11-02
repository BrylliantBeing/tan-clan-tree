import { Link } from 'expo-router';
import { type ComponentProps, type PropsWithChildren, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export function Screen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.screenContent, { paddingTop: Spacing.three + insets.top }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </ThemedView>
  );
}

export function Heading({ children }: PropsWithChildren) {
  return (
    <ThemedText type="subtitle" role="heading" style={styles.heading}>
      {children}
    </ThemedText>
  );
}

export function SectionHeading({ children }: PropsWithChildren) {
  return (
    <ThemedText type="smallBold" role="heading" style={styles.sectionHeading}>
      {children}
    </ThemedText>
  );
}

export function Hint({ children }: PropsWithChildren) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

export function Card({ children }: PropsWithChildren) {
  const theme = useTheme();
  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, { borderColor: theme.border, boxShadow: `0 1px 3px ${theme.shadow}` }]}>
      {children}
    </ThemedView>
  );
}

export function TextLink({ style, ...rest }: ComponentProps<typeof Link>) {
  const theme = useTheme();
  return <Link {...rest} style={[styles.link, { color: theme.accent }, style]} />;
}

type FieldProps = ComponentProps<typeof TextInput> & { label: string; hint?: string };

export function Field({ label, hint, style, ...inputProps }: FieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
          style,
        ]}
        {...inputProps}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}

export function DateField(props: FieldProps) {
  return <Field placeholder="YYYY-MM-DD" autoCorrect={false} maxLength={10} {...props} />;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', busy, disabled }: ButtonProps) {
  const theme = useTheme();
  const colors = {
    primary: { background: theme.accent, text: theme.onAccent },
    secondary: { background: theme.backgroundSelected, text: theme.text },
    danger: { background: 'transparent', text: theme.danger },
  }[variant];

  return (
    <Pressable
      role="button"
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.background },
        variant === 'danger' && { borderColor: theme.danger, borderWidth: 1 },
        (pressed || disabled) && styles.dimmed,
      ]}>
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <ThemedText type="smallBold" style={{ color: colors.text }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

// Asks for a second press, because the browser's confirm dialogs do not exist on every platform
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  busy,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  if (!isConfirming) return <Button label={label} variant="secondary" onPress={() => setIsConfirming(true)} />;
  return (
    <View style={styles.row}>
      <Button label={confirmLabel} variant="danger" busy={busy} onPress={onConfirm} />
      <Button label="Cancel" variant="secondary" onPress={() => setIsConfirming(false)} />
    </View>
  );
}

export function ErrorMessage({ message }: { message: string | null }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <ThemedText type="small" role="alert" style={{ color: theme.danger }}>
      {message}
    </ThemedText>
  );
}

export function Choice<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.row} role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={option.value}
              role="radio"
              aria-checked={isSelected}
              onPress={() => onChange(option.value)}
              style={[
                styles.choice,
                { borderColor: isSelected ? theme.accent : theme.border },
                isSelected && { backgroundColor: theme.accent },
              ]}>
              <ThemedText type="small" style={isSelected ? { color: theme.onAccent } : undefined}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export type GenderValue = 'male' | 'female' | '';

export function GenderChoice({ value, onChange }: { value: GenderValue; onChange: (value: GenderValue) => void }) {
  return (
    <Choice
      label="Gender (used for Chinese family terms)"
      options={[
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
        { value: '', label: 'Not set' },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

export function PersonPicker<Person extends { id: string; fullName: string }>({
  label,
  people,
  selectedId,
  onSelect,
}: {
  label: string;
  people: Person[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const selected = people.find((person) => person.id === selectedId);
  const search = query.trim().toLowerCase();
  const matches = search
    ? people.filter((person) => person.fullName.toLowerCase().includes(search)).slice(0, 6)
    : [];

  return (
    <View style={styles.field}>
      <Field
        label={label}
        value={query}
        onChangeText={setQuery}
        placeholder="Type a name to search"
        autoCorrect={false}
      />
      {selected ? <Hint>{`Selected: ${selected.fullName}`}</Hint> : null}
      {matches.map((person) => (
        <Pressable
          key={person.id}
          role="button"
          onPress={() => {
            onSelect(person.id);
            setQuery('');
          }}
          style={[styles.pickerRow, { borderColor: theme.border }]}>
          <ThemedText type="small">{person.fullName}</ThemedText>
        </Pressable>
      ))}
      {search && matches.length === 0 ? <Hint>No one in the tree matches that name.</Hint> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenContent: {
    alignItems: 'center',
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  heading: {
    fontSize: 26,
    lineHeight: 34,
  },
  sectionHeading: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    marginTop: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.small,
    gap: Spacing.two,
  },
  link: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    textDecorationLine: 'underline',
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.small,
    fontFamily: Fonts.sans,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    // 16px stops phone browsers from zooming the page when a field is focused
    fontSize: 16,
    minHeight: 44,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
  },
  pickerRow: {
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.two,
  },
});
