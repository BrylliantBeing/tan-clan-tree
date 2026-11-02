import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSession } from '@/features/session/session-context';
import { api, ApiError, errorMessage } from '@/lib/api';

import { type ParentChildLink } from './graph';
import { type SpouseLink } from './layout';

export type Person = {
  id: string;
  fullName: string;
  birthDate: string | null;
  deathDate: string | null;
  isDeceased: boolean;
  facebookUrl: string | null;
  hasAccount: boolean;
  role: 'member' | 'admin';
};

export type TreeData = {
  people: Person[];
  spouses: SpouseLink[];
  parentChild: ParentChildLink[];
};

export function useTree() {
  const { refresh: refreshSession } = useSession();
  const [tree, setTree] = useState<TreeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTree(await api<TreeData>('/api/tree'));
      setError(null);
    } catch (caught) {
      // The session ended or approval changed, so let the root navigator move the user along
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
        await refreshSession();
      }
      setError(errorMessage(caught));
    }
  }, [refreshSession]);

  // Reloads whenever the screen comes back into view, so new approvals show up
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { tree, error, reload };
}

export function spousesOf(tree: TreeData, personId: string) {
  const ids = tree.spouses.flatMap(({ firstId, secondId }) => {
    if (firstId === personId) return [secondId];
    if (secondId === personId) return [firstId];
    return [];
  });
  return tree.people.filter((person) => ids.includes(person.id));
}

export function parentsOf(tree: TreeData, personId: string) {
  const ids = tree.parentChild.filter((link) => link.childId === personId).map((link) => link.parentId);
  return tree.people.filter((person) => ids.includes(person.id));
}

export function childrenOf(tree: TreeData, personId: string) {
  const ids = tree.parentChild.filter((link) => link.parentId === personId).map((link) => link.childId);
  return tree.people.filter((person) => ids.includes(person.id));
}
