import { useState } from "react";

import { SidePanel, type SidePanelSection } from "../../../../../design/components/SidePanel";
import { KIND_LABEL, formatRelative, type WorkGraphIndexes } from "./shared";
import type {
  WorkGraphObjectSummary,
  WorkGraphProjection,
} from "./types";

interface WorkObjectDrawerProps {
  graph: WorkGraphProjection;
  indexes: WorkGraphIndexes;
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}

const SECTIONS = ["identity", "anchors", "evidence", "gates", "diagnostics"] as const;
type SectionId = (typeof SECTIONS)[number];

export function WorkObjectDrawer({
  graph,
  indexes,
  selectedId,
  onClose,
  onSelect,
}: WorkObjectDrawerProps): JSX.Element | null {
  const [activeSection, setActiveSection] = useState<SectionId>("identity");
  if (!selectedId) return null;
  const object = indexes.objectsById.get(selectedId);
  if (!object) {
    return (
      <SidePanel
        title="Selection lost"
        activeSection="missing"
        onSectionToggle={() => undefined}
        onClose={onClose}
        className="chatPaneSidePanel chatPaneSidePanelBelowBar topDownDrawer"
        sections={[
          {
            id: "missing",
            title: "Object not in projection",
            children: (
              <p className="topDownDrawer__missing">
                Selected id <code>{selectedId}</code> is not in the current
                WorkGraphProjection.
              </p>
            ),
          },
        ]}
      />
    );
  }

  const evidence = indexes.evidenceByAnchor.get(object.id) ?? [];
  const gates = indexes.gatesBySubject.get(object.id) ?? [];
  const diagnostics = graph.diagnostics.filter((d) => d.objectId === object.id);

  const sections: SidePanelSection[] = [
    {
      id: "identity",
      title: "Identity",
      children: (
        <dl className="topDownDrawer__list">
          <Field label="Kind" value={KIND_LABEL[object.kind]} />
          <Field label="Status" value={object.status} />
          <Field label="Layer" value={object.structuralLayer ?? "(cross-cutting)"} />
          {object.ownerRole ? <Field label="Owner role" value={object.ownerRole} /> : null}
          {object.nextAction ? <Field label="Next action" value={object.nextAction} /> : null}
          <Field label="Updated" value={formatRelative(object.updatedAt)} />
          {object.summary ? <Field label="Summary" value={object.summary} /> : null}
        </dl>
      ),
    },
    {
      id: "anchors",
      title: "Anchors",
      children: (
        <AnchorsBlock object={object} indexes={indexes} onSelect={onSelect} />
      ),
    },
    {
      id: "evidence",
      title: "Evidence",
      badge: evidence.length || undefined,
      children:
        evidence.length === 0 ? (
          <p className="topDownDrawer__empty">No evidence attached.</p>
        ) : (
          <ul className="topDownDrawer__refs">
            {evidence.map((a) => {
              const target = indexes.objectsById.get(a.evidenceObjectId);
              return (
                <li key={a.evidenceObjectId}>
                  <span className="topDownDrawer__refKind">{a.relation}</span>
                  {target ? (
                    <button
                      type="button"
                      className="topDownDrawer__refLink"
                      onClick={() => onSelect(target.id)}
                    >
                      {target.title}
                    </button>
                  ) : (
                    <span>{a.evidenceObjectId} (missing)</span>
                  )}
                </li>
              );
            })}
          </ul>
        ),
    },
    {
      id: "gates",
      title: "Gates",
      badge: gates.length || undefined,
      children:
        gates.length === 0 ? (
          <p className="topDownDrawer__empty">No approval gates.</p>
        ) : (
          <ul className="topDownDrawer__refs">
            {gates.map((g) => {
              const target = indexes.objectsById.get(g.gateObjectId);
              return (
                <li key={g.gateObjectId}>
                  <span
                    className={`topDownDrawer__gateState topDownDrawer__gateState--${g.state}`}
                  >
                    {g.state}
                  </span>
                  {target ? (
                    <button
                      type="button"
                      className="topDownDrawer__refLink"
                      onClick={() => onSelect(target.id)}
                    >
                      {target.title}
                    </button>
                  ) : (
                    <span>{g.gateObjectId} (missing)</span>
                  )}
                </li>
              );
            })}
          </ul>
        ),
    },
  ];
  if (diagnostics.length > 0) {
    sections.push({
      id: "diagnostics",
      title: "Diagnostics",
      badge: diagnostics.length,
      children: (
        <ul className="topDownDrawer__diagnostics">
          {diagnostics.map((d) => (
            <li
              key={d.id}
              className={`topDownDrawer__diagnostic topDownDrawer__diagnostic--${d.severity}`}
            >
              <span className="topDownDrawer__diagnosticKind">{d.kind}</span>
              <p>{d.message}</p>
            </li>
          ))}
        </ul>
      ),
    });
  }

  return (
    <SidePanel
      title={object.title}
      activeSection={activeSection}
      onSectionToggle={(id) => setActiveSection(id as SectionId)}
      onClose={onClose}
      className="chatPaneSidePanel chatPaneSidePanelBelowBar topDownDrawer"
      sections={sections}
    />
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="topDownDrawer__field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AnchorsBlock({
  object,
  indexes,
  onSelect,
}: {
  object: WorkGraphObjectSummary;
  indexes: WorkGraphIndexes;
  onSelect: (id: string) => void;
}): JSX.Element {
  const rows: Array<{ label: string; id: string | null }> = [
    { label: "Project", id: object.linkedProjectId },
    { label: "Work item", id: object.linkedWorkItemId },
    { label: "Task", id: object.linkedTaskId },
    { label: "Run", id: object.linkedRunId },
    { label: "Conversation", id: object.linkedConversationId },
  ];
  const present = rows.filter((r) => r.id !== null);
  if (present.length === 0) {
    return <p className="topDownDrawer__empty">No structural anchors.</p>;
  }
  return (
    <ul className="topDownDrawer__refs">
      {present.map((r) => {
        const target = r.id ? indexes.objectsById.get(r.id) : undefined;
        return (
          <li key={r.label}>
            <span className="topDownDrawer__refKind">{r.label}</span>
            {target ? (
              <button
                type="button"
                className="topDownDrawer__refLink"
                onClick={() => onSelect(target.id)}
              >
                {target.title}
              </button>
            ) : (
              <span className="topDownDrawer__refBroken">
                {r.id} (missing)
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
