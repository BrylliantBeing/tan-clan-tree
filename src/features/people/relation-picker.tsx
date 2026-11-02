import { Choice, Hint, PersonPicker } from '@/components/form';
import { spousesOf, type TreeData } from '@/features/tree/use-tree';

export type RelationValue = {
  relationType: 'spouse' | 'child' | 'parent';
  relativeId: string | null;
  otherParentId: string | null;
};

const RELATION_OPTIONS = [
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' },
] as const;

const NO_OTHER_PARENT = 'none';

export function RelationPicker({
  tree,
  value,
  onChange,
}: {
  tree: TreeData;
  value: RelationValue;
  onChange: (value: RelationValue) => void;
}) {
  const relative = tree.people.find((person) => person.id === value.relativeId);
  const relativeSpouses = value.relativeId ? spousesOf(tree, value.relativeId) : [];

  return (
    <>
      <Choice
        label="How are they related?"
        options={[...RELATION_OPTIONS]}
        value={value.relationType}
        onChange={(relationType) => onChange({ ...value, relationType, otherParentId: null })}
      />
      <PersonPicker
        label={`Whose ${value.relationType} are they?`}
        people={tree.people}
        selectedId={value.relativeId}
        onSelect={(relativeId) => onChange({ ...value, relativeId, otherParentId: null })}
      />
      {value.relationType === 'child' && relativeSpouses.length > 0 ? (
        <>
          <Choice
            label={`Who is the other parent, alongside ${relative?.fullName}?`}
            options={[
              ...relativeSpouses.map((spouse) => ({ value: spouse.id, label: spouse.fullName })),
              { value: NO_OTHER_PARENT, label: 'Not listed' },
            ]}
            value={value.otherParentId ?? NO_OTHER_PARENT}
            onChange={(choice) =>
              onChange({ ...value, otherParentId: choice === NO_OTHER_PARENT ? null : choice })
            }
          />
          <Hint>This keeps half-siblings under the right couple in the tree.</Hint>
        </>
      ) : null}
    </>
  );
}
