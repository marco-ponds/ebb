export function CompareScreen({ ids }: { ids: string[] }) {
  return <h1 data-session-ids={ids.join(',')}>Compare</h1>;
}
