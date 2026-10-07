export function chatReduction(count: number) {
  const groups: { key: string; inputs: string[] }[] = [];
  let nodes = Array.from({ length: count }, (_, index) => `map:${index}`),
    level = 0;
  while (nodes.length > 1) {
    const next: string[] = [];
    for (let start = 0; start < nodes.length; start += 4) {
      const key = `reduce:${level}:${next.length}`;
      groups.push({ key, inputs: nodes.slice(start, start + 4) });
      next.push(key);
    }
    nodes = next;
    level++;
  }
  return { groups, root: nodes[0] ?? null };
}
