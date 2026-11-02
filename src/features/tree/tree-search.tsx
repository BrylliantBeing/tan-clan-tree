import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Hint } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { Avatar } from '@/features/people/avatar';
import { useTheme } from '@/hooks/use-theme';

import { type Relation, relationText, searchPeople } from './kinship';
import { type Person } from './use-tree';

const BAR_HEIGHT = 44;
const MAX_WIDTH = 360;
const MAX_RESULTS_HEIGHT = 320;

// How far down from the top of the tree other panels have to start, to stay clear of the search bar
export const SEARCH_CLEARANCE = Spacing.two * 2 + BAR_HEIGHT;

export function TreeSearch({
  people,
  relations,
  maxHeight,
  onChoose,
}: {
  people: Person[];
  relations: Map<string, Relation>;
  maxHeight: number;
  onChoose: (id: string) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const matches = searchPeople(people, relations, query);
  const panelStyle = {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.border,
    boxShadow: `0 1px 3px ${theme.shadow}`,
  };

  const choose = (id: string) => {
    setQuery('');
    Keyboard.dismiss();
    onChoose(id);
  };

  return (
    <View style={styles.search}>
      <View>
        <TextInput
          role="searchbox"
          accessibilityLabel="Search the family tree"
          placeholder="Search a name or term, like Achi"
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => {
            if (matches[0]) choose(matches[0].id);
          }}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === 'Escape') setQuery('');
          }}
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.input, panelStyle, { color: theme.text }]}
        />
        {query ? (
          <Pressable role="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clear}>
            <ThemedText themeColor="textSecondary">×</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {query.trim() ? (
        <ThemedView type="backgroundElement" style={[styles.results, panelStyle]}>
          {matches.length === 0 ? (
            <View style={styles.empty}>
              <Hint>No one in the tree matches that.</Hint>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: Math.min(maxHeight, MAX_RESULTS_HEIGHT) }}
              keyboardShouldPersistTaps="handled">
              {matches.map((person) => {
                const relation = relations.get(person.id);
                return (
                  <Pressable
                    key={person.id}
                    role="button"
                    onPress={() => choose(person.id)}
                    style={[styles.row, { borderColor: theme.border }]}>
                    <Avatar person={person} size={36} />
                    <View style={styles.rowText}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {person.fullName}
                      </ThemedText>
                      {relation ? (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {relationText(relation)}
                        </ThemedText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </ThemedView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    right: Spacing.two,
    maxWidth: MAX_WIDTH,
    gap: Spacing.one,
  },
  input: {
    height: BAR_HEIGHT,
    borderWidth: 1,
    borderRadius: Radius.small,
    fontFamily: Fonts.sans,
    // 16px stops phone browsers from zooming the page when a field is focused
    fontSize: 16,
    paddingLeft: Spacing.three,
    paddingRight: BAR_HEIGHT,
  },
  clear: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: BAR_HEIGHT,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: {
    borderWidth: 1,
    borderRadius: Radius.small,
    overflow: 'hidden',
  },
  empty: {
    padding: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
  },
});
