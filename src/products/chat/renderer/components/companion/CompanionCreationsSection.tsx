import type { CompanionDerivedRecord } from '../../../companion/contracts.js';

export interface CompanionCreationsSectionProps {
  derived: CompanionDerivedRecord[];
  loading: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function derivedKindLabel(kind: string): string {
  switch (kind) {
    case 'summary': return 'Summary';
    case 'transcript': return 'Transcript';
    case 'caption': return 'Caption';
    case 'metadata': return 'Metadata';
    case 'analysis': return 'Analysis';
    default: return kind;
  }
}

interface GroupedDerived {
  kind: string;
  label: string;
  records: CompanionDerivedRecord[];
}

function groupByKind(records: CompanionDerivedRecord[]): GroupedDerived[] {
  const groups = new Map<string, CompanionDerivedRecord[]>();
  for (const record of records) {
    const existing = groups.get(record.kind) ?? [];
    existing.push(record);
    groups.set(record.kind, existing);
  }
  return Array.from(groups.entries()).map(([kind, items]) => ({
    kind,
    label: derivedKindLabel(kind),
    records: items,
  }));
}

export function CompanionCreationsSection({
  derived,
  loading,
}: CompanionCreationsSectionProps) {
  if (loading && derived.length === 0) {
    return <div className="companionSection companionLoading">Loading...</div>;
  }

  if (derived.length === 0) {
    return (
      <div className="companionSection companionCreations">
        <p className="companionEmpty">
          No creations yet. Your companion will produce summaries, analyses, and other artifacts as you interact.
        </p>
      </div>
    );
  }

  const groups = groupByKind(derived);

  return (
    <div className="companionSection companionCreations">
      {groups.map((group) => (
        <div key={group.kind} className="companionCard companionCreationGroup">
          <div className="companionCardHeader">{group.label}</div>
          <ul className="companionDerivedList">
            {group.records.map((record) => (
              <li key={record.id} className="companionDerivedItem">
                <span className="companionDerivedTitle">
                  {record.title || 'Untitled'}
                </span>
                {record.content && (
                  <p className="companionDerivedExcerpt">
                    {record.content.length > 200
                      ? `${record.content.slice(0, 200)}...`
                      : record.content}
                  </p>
                )}
                <span className="companionDerivedDate">
                  {formatDate(record.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
