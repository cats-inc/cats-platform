import { useState } from "react";

import { SidePanel, type SidePanelSection } from "../../../../../design/components/SidePanel";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import {
  getWorkGraphGateStateLabel,
  getWorkGraphKindLabel,
  formatRelative,
  type WorkGraphIndexes,
} from "./shared";
import { getWorkObjectStatusLabel } from "./WorkObjectCard";
import type { WorkGraphObjectSummary, WorkGraphProjection } from "./types";

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
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<SectionId>("identity");
  if (!selectedId) return null;
  const object = indexes.objectsById.get(selectedId);
  if (!object) {
    return (
      <SidePanel
        title={t("workTopdownSelectionLost")}
        activeSection="missing"
        onSectionToggle={() => undefined}
        onClose={onClose}
        className="chatPaneSidePanel chatPaneSidePanelBelowBar topDownDrawer"
        sections={[
          {
            id: "missing",
            title: t("workTopdownObjectNotInProjectionTitle"),
            children: (
              <p className="topDownDrawer__missing">
                {t("workTopdownObjectNotInProjectionMessage", {
                  selectedId,
                })}
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
      title: t("workTopdownIdentityTitle"),
      children: (
        <dl className="topDownDrawer__list">
          <Field
            label={t("workTopdownIdentityKind")}
            value={getWorkGraphKindLabel(object.kind, t)}
          />
          <Field
            label={t("workTopdownIdentityStatus")}
            value={getWorkObjectStatusLabel(object.status, t)}
          />
          <Field
            label={t("workTopdownIdentityLayer")}
            value={object.structuralLayer ?? t("workTopdownCrossCuttingLayer")}
          />
          {object.ownerRole ? (
            <Field label={t("workTopdownIdentityOwnerRole")} value={object.ownerRole} />
          ) : null}
          {object.nextAction ? (
            <Field
              label={t("workTopdownIdentityNextAction")}
              value={object.nextAction}
            />
          ) : null}
            <Field
              label={t("workTopdownIdentityUpdated")}
              value={formatRelative(object.updatedAt, t)}
            />
          {object.summary ? (
            <Field label={t("workTopdownIdentitySummary")} value={object.summary} />
          ) : null}
        </dl>
      ),
    },
    {
      id: "anchors",
      title: t("workTopdownAnchorsTitle"),
      children: (
        <AnchorsBlock object={object} indexes={indexes} onSelect={onSelect} />
      ),
    },
    {
      id: "evidence",
      title: t("workTopdownEvidenceTitle"),
      badge: evidence.length || undefined,
      children:
        evidence.length === 0 ? (
          <p className="topDownDrawer__empty">{t("workTopdownEvidenceEmpty")}</p>
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
                    <span>
                      {a.evidenceObjectId} {t("workTopdownMissingSuffix")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ),
    },
    {
      id: "gates",
      title: t("workTopdownGatesTitle"),
      badge: gates.length || undefined,
      children:
        gates.length === 0 ? (
          <p className="topDownDrawer__empty">{t("workTopdownGatesEmpty")}</p>
        ) : (
          <ul className="topDownDrawer__refs">
            {gates.map((g) => {
              const target = indexes.objectsById.get(g.gateObjectId);
              return (
                <li key={g.gateObjectId}>
                  <span
                    className={`topDownDrawer__gateState topDownDrawer__gateState--${g.state}`}
                  >
                    {getWorkGraphGateStateLabel(g.state, t)}
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
                    <span>
                      {g.gateObjectId} {t("workTopdownMissingSuffix")}
                    </span>
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
      title: t("workTopdownDiagnosticsTitle"),
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
  const { t } = useI18n();
  const rows: Array<{ label: string; id: string | null }> = [
    { label: t("workTopdownAnchorProject"), id: object.linkedProjectId },
    { label: t("workTopdownAnchorWorkItem"), id: object.linkedWorkItemId },
    { label: t("workTopdownAnchorTask"), id: object.linkedTaskId },
    { label: t("workTopdownAnchorRun"), id: object.linkedRunId },
    { label: t("workTopdownAnchorConversation"), id: object.linkedConversationId },
  ];
  const present = rows.filter((r) => r.id !== null);
  if (present.length === 0) {
    return <p className="topDownDrawer__empty">{t("workTopdownAnchorsEmpty")}</p>;
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
                {r.id} {t("workTopdownMissingSuffix")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
