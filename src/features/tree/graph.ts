export type ParentChildLink = { parentId: string; childId: string };

// True when linking parentId -> childId would make someone their own ancestor
export function wouldCreateCycle(links: ParentChildLink[], parentId: string, childId: string) {
  if (parentId === childId) return true;
  const childrenByParent = new Map<string, string[]>();
  for (const link of links) {
    const children = childrenByParent.get(link.parentId) ?? [];
    children.push(link.childId);
    childrenByParent.set(link.parentId, children);
  }

  const seen = new Set<string>();
  const stack = [childId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === parentId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return false;
}
