import {
  ATTENTION_LABEL,
  KIND_LABEL,
  type EvidenceCounts,
  type WorkGraphIndexes,
} from "./shared";
import type { WorkGraphGateDecorator, WorkGraphObjectSummary } from "./types";

interface WorkObjectCardProps {
  object: WorkGraphObjectSummary;
  evidence: EvidenceCounts;
  gates: WorkGraphGateDecorator[];
  selected: boolean;
  onSelect: (id: string) => void;
}

export function WorkObjectCard({
  object,
  evidence,
  gates,
  selected,
  onSelect,
}: WorkObjectCardProps): JSX.Element {
  const attentionTag = ATTENTION_LABEL[object.attention];
  return (
    <article
      className={
        "topDownCard" +
        ` topDownCard--${object.kind}` +
        ` topDownCard--attention-${object.attention}` +
        (selected ? " topDownCard--selected" : "")
      }
      role="button"
      tabIndex={0}
      onClick={() => onSelect(object.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(object.id);
        }
      }}
    >
      <header className="topDownCard__head">
        <span className="topDownCard__kind">{KIND_LABEL[object.kind]}</span>
        {object.kind === "task" && object.productBinding ? (
          <span
            className={`topDownCard__binding topDownCard__binding--${object.productBinding}`}
            title={`Task product binding: ${object.productBinding}`}
          >
            {object.productBinding}
          </span>
        ) : null}
        {attentionTag ? (
          <span
            className={`topDownCard__attention topDownCard__attention--${object.attention}`}
          >
            {attentionTag}
          </span>
        ) : null}
        <span className="topDownCard__status">{object.status}</span>
      </header>
      <h4 className="topDownCard__title">{object.title}</h4>
      {object.summary ? (
        <p className="topDownCard__summary">{object.summary}</p>
      ) : null}
      {object.nextAction ? (
        <p className="topDownCard__next">→ {object.nextAction}</p>
      ) : null}
      {evidence.total > 0 || gates.length > 0 || object.ownerRole ? (
        <footer className="topDownCard__foot">
          {object.ownerRole ? (
            <span className="topDownCard__role">{object.ownerRole}</span>
          ) : null}
          {evidence.artifact > 0 ? (
            <span className="topDownCard__chip topDownCard__chip--artifact">
              📎 {evidence.artifact}
            </span>
          ) : null}
          {evidence.activity > 0 ? (
            <span className="topDownCard__chip topDownCard__chip--activity">
              📜 {evidence.activity}
            </span>
          ) : null}
          {evidence.outcome > 0 ? (
            <span className="topDownCard__chip topDownCard__chip--outcome">
              🎯 {evidence.outcome}
            </span>
          ) : null}
          {gates.map((g) => (
            <span
              key={g.gateObjectId}
              className={`topDownCard__chip topDownCard__chip--gate-${g.state}`}
            >
              ⊘ {g.state.replace(/_/g, " ")}
            </span>
          ))}
        </footer>
      ) : null}
    </article>
  );
}

export function pickEvidence(
  indexes: WorkGraphIndexes,
  objectId: string,
): EvidenceCounts {
  const list = indexes.evidenceByAnchor.get(objectId);
  const c: EvidenceCounts = { artifact: 0, activity: 0, outcome: 0, total: 0 };
  if (!list) return c;
  for (const a of list) {
    c[a.relation] += 1;
    c.total += 1;
  }
  return c;
}
