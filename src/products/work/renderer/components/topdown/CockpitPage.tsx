import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  EMPTY_WORK_GRAPH,
  useWorkGraphQuery,
} from "../../state/queries/workGraphQuery.js";
import type { MessageKey } from "../../../../../shared/i18n/index.js";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { BlockersRail } from "./BlockersRail";
import { buildIndexes, formatRelative } from "./shared";
import type {
  WorkAttentionState,
  WorkGraphObjectKind,
  WorkGraphObjectSummary,
  WorkGraphProjection,
} from "./types";
import { WorkObjectCard, pickEvidence } from "./WorkObjectCard";
import { WorkObjectDrawer } from "./WorkObjectDrawer";
import "./topdown.css";

type CockpitTab =
  | "command"
  | "needs-decision"
  | "active"
  | "active-runs"
  | "blocked"
  | "shipped"
  | "teams";

const TABS: ReadonlyArray<{
  id: CockpitTab;
  labelKey: MessageKey;
  subKey: MessageKey;
}> = [
  {
    id: "command",
    labelKey: "workTopdownCockpitTabCommandLabel",
    subKey: "workTopdownCockpitTabCommandSub",
  },
  {
    id: "needs-decision",
    labelKey: "workTopdownCockpitTabNeedsDecisionLabel",
    subKey: "workTopdownCockpitTabNeedsDecisionSub",
  },
  {
    id: "active",
    labelKey: "workTopdownCockpitTabActiveLabel",
    subKey: "workTopdownCockpitTabActiveSub",
  },
  {
    id: "active-runs",
    labelKey: "workTopdownCockpitTabActiveRunsLabel",
    subKey: "workTopdownCockpitTabActiveRunsSub",
  },
  {
    id: "blocked",
    labelKey: "workTopdownCockpitTabBlockedLabel",
    subKey: "workTopdownCockpitTabBlockedSub",
  },
  {
    id: "shipped",
    labelKey: "workTopdownCockpitTabShippedLabel",
    subKey: "workTopdownCockpitTabShippedSub",
  },
  {
    id: "teams",
    labelKey: "workTopdownCockpitTabTeamsLabel",
    subKey: "workTopdownCockpitTabTeamsSub",
  },
];

const COMMAND_CENTER_ORDER: BucketId[] = [
  "needs-decision",
  "blocked",
  "active",
  "active-runs",
  "shipped",
];

const OPERATIONAL_KINDS: WorkGraphObjectKind[] = [
  "project",
  "work_item",
  "task",
  "mission",
  "run",
  "conversation",
];

const ATTENTION_TO_BUCKET: Partial<Record<WorkAttentionState, BucketId>> = {
  decision_needed: "needs-decision",
  blocked: "blocked",
  failed: "blocked",
  recently_shipped: "shipped",
};

type BucketId =
  | "needs-decision"
  | "active"
  | "active-runs"
  | "blocked"
  | "shipped";

export function CockpitPage(): JSX.Element {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as CockpitTab | null) ?? "command";
  const selectedId = searchParams.get("selectedId");
  const graph = useWorkGraphQuery().data ?? EMPTY_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);

  const buckets = useMemo(() => {
    const out: Record<BucketId, WorkGraphObjectSummary[]> = {
      "needs-decision": [],
      active: [],
      "active-runs": [],
      blocked: [],
      shipped: [],
    };
    for (const o of graph.objects) {
      if (!OPERATIONAL_KINDS.includes(o.kind)) continue;
      // Active Runs: dedicated bucket so executing runs are visible
      // alongside (not buried inside) task-level Active. Runs that
      // are blocked / failed / completed still flow to attention-derived
      // buckets via ATTENTION_TO_BUCKET below.
      if (o.kind === "run" && o.status === "running") {
        out["active-runs"].push(o);
        continue;
      }
      const target = ATTENTION_TO_BUCKET[o.attention];
      if (target) {
        out[target].push(o);
      } else if (
        o.attention === "none" &&
        ["in_progress", "active"].includes(o.status)
      ) {
        out.active.push(o);
      }
    }
    return out;
  }, [graph]);

  const teamLanes = useMemo(() => {
    const map = new Map<string, WorkGraphObjectSummary[]>();
    for (const o of graph.objects) {
      if (!OPERATIONAL_KINDS.includes(o.kind)) continue;
      if (!o.ownerRole) continue;
      const list = map.get(o.ownerRole) ?? [];
      list.push(o);
      map.set(o.ownerRole, list);
    }
    return Array.from(map.entries())
      .map(([role, items]) => ({ role, items }))
      .sort((a, b) => a.role.localeCompare(b.role));
  }, [graph]);

  function setTab(next: CockpitTab): void {
    const params = new URLSearchParams(searchParams);
    if (next === "command") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  function setSelectedId(id: string | null): void {
    const params = new URLSearchParams(searchParams);
    if (id === null) params.delete("selectedId");
    else params.set("selectedId", id);
    setSearchParams(params, { replace: true });
  }

  const counts: Record<BucketId | "teams", number> = {
    "needs-decision": buckets["needs-decision"].length,
    active: buckets.active.length,
    "active-runs": buckets["active-runs"].length,
    blocked: buckets.blocked.length,
    shipped: buckets.shipped.length,
    teams: teamLanes.length,
  };
  const current = TABS.find((item) => item.id === tab);
  const tabLabel = current ? t(current.labelKey) : "";
  const tabSub = current ? t(current.subKey) : "";

  return (
    <div className="topDownPage">
      <header className="channelTopBar topDownTopBar">
        <div className="channelTopBarStart topDownTopBar__start">
          <span className="topDownTopBar__eyebrow">
            {t("workTopdownCockpitEyebrow")}
          </span>
          <h1 className="channelTopBarTitle topDownTopBar__title">
            {t("workTopdownCockpitTitle")}
          </h1>
        </div>
        <div className="channelTopBarCenter topDownTopBar__center">
          <p className="topDownTopBar__lede">
            {t("workTopdownCockpitLede")}
          </p>
        </div>
        <div className="channelTopBarEnd topDownTopBar__end">
          <span
            className={
              "topDownTopBar__metric" +
              (counts["needs-decision"] > 0
                ? " topDownTopBar__metric--warn"
                : "")
            }
          >
            <strong>{counts["needs-decision"]}</strong>{" "}
            {t("workTopdownCockpitMetricDecisions")}
          </span>
          <span
            className={
              "topDownTopBar__metric" +
              (counts.blocked > 0 ? " topDownTopBar__metric--bad" : "")
            }
          >
            <strong>{counts.blocked}</strong> {t("workTopdownCockpitMetricBlocked")}
          </span>
          <span className="topDownTopBar__metric">
            <strong>{counts.shipped}</strong>{" "}
            {t("workTopdownCockpitMetricShipped")}
          </span>
        </div>
      </header>
      <nav
        className="cockpit__tabs"
        aria-label={t("workTopdownCockpitTabsAriaLabel")}
      >
        {TABS.map((tabItem) => {
          const label = t(tabItem.labelKey);
          const sub = t(tabItem.subKey);
          return (
            <button
              key={tabItem.id}
              type="button"
              className={
                "cockpit__tab" + (tab === tabItem.id ? " cockpit__tab--active" : "")
              }
              onClick={() => setTab(tabItem.id)}
              aria-pressed={tab === tabItem.id}
            >
              <span className="cockpit__tabLabel">{label}</span>
              <span className="cockpit__tabSub">{sub}</span>
              {tabItem.id !== "command" && tabItem.id !== "teams" ? (
                <span className="cockpit__tabCount">
                  {counts[tabItem.id as Exclude<CockpitTab, "command" | "teams">]}
                </span>
              ) : null}
              {tabItem.id === "teams" ? (
                <span className="cockpit__tabCount">{counts.teams}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="cockpit__main">
        {tab === "command" ? (
          <CommandCenter
            graph={graph}
            buckets={buckets}
            indexes={indexes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onJump={(id) => setTab(id)}
            tabs={TABS}
            t={t}
          />
        ) : tab === "teams" ? (
          <TeamsLanes
            lanes={teamLanes}
            indexes={indexes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            t={t}
          />
        ) : (
          <BucketDetail
            label={tabLabel}
            sub={tabSub}
            objects={buckets[tab as BucketId]}
            graph={graph}
            indexes={indexes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            t={t}
          />
        )}
      </div>
      <WorkObjectDrawer
        graph={graph}
        indexes={indexes}
        selectedId={selectedId}
        onClose={() => setSelectedId(null)}
        onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
      />
    </div>
  );
}

function CommandCenter({
  graph,
  buckets,
  indexes,
  selectedId,
  onSelect,
  onJump,
  tabs,
  t,
}: {
  graph: WorkGraphProjection;
  buckets: Record<BucketId, WorkGraphObjectSummary[]>;
  indexes: ReturnType<typeof buildIndexes>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onJump: (id: CockpitTab) => void;
  tabs: ReadonlyArray<{ id: CockpitTab; labelKey: MessageKey; subKey: MessageKey }>;
  t: ReturnType<typeof useI18n>["t"];
}): JSX.Element {
  const recentActivity = graph.objects
    .filter((o) => o.kind === "activity")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  function getTabLabel(tabId: CockpitTab): string {
    const tabMeta = tabs.find((item) => item.id === tabId);
    return tabMeta ? t(tabMeta.labelKey) : "";
  }

  return (
    <div className="commandCenter">
      <div className="commandCenter__grid">
        {COMMAND_CENTER_ORDER.map((id) => (
          <section
            key={id}
            className="commandCenter__bucket"
            data-bucket={id}
            aria-label={getTabLabel(id)}
          >
            <header className="commandCenter__bucketHead">
              <h3>{getTabLabel(id)}</h3>
              <span className="commandCenter__bucketCount">
                {buckets[id].length}
              </span>
              <button
                type="button"
                className="commandCenter__seeMore"
                onClick={() => onJump(id)}
              >
                {t("workTopdownCockpitOpen")} →
              </button>
            </header>
            <div className="commandCenter__bucketBody">
              {buckets[id].length === 0 ? (
                <p className="commandCenter__empty">
                  {t("workTopdownCockpitNoBucketItems")}
                </p>
              ) : (
                buckets[id].slice(0, 3).map((o) => (
                  <WorkObjectCard
                    key={o.id}
                    object={o}
                    evidence={pickEvidence(indexes, o.id)}
                    gates={indexes.gatesBySubject.get(o.id) ?? []}
                    selected={selectedId === o.id}
                    onSelect={(next) =>
                      onSelect(selectedId === next ? null : next)
                    }
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
      <aside
        className="commandCenter__rail"
        aria-label={t("workTopdownCockpitRecentActivityAriaLabel")}
      >
        <header className="commandCenter__railHead">
          <h3>{t("workTopdownCockpitRecentActivityTitle")}</h3>
          <p>
            {t("workTopdownCockpitRecentActivitySummary", {
              count: `${recentActivity.length}`,
            })}
          </p>
        </header>
        {recentActivity.length === 0 ? (
          <p className="commandCenter__empty">
            {t("workTopdownCockpitRecentActivityEmpty")}
          </p>
        ) : (
          <ul className="commandCenter__activityList">
            {recentActivity.map((act) => (
              <li
                key={act.id}
                className={
                  "commandCenter__activityItem" +
                  (selectedId === act.id
                    ? " commandCenter__activityItem--selected"
                    : "")
                }
              >
                <button
                  type="button"
                  onClick={() => onSelect(selectedId === act.id ? null : act.id)}
                >
                  <span className="commandCenter__activityTitle">
                    {act.title}
                  </span>
                  <span className="commandCenter__activityWhen">
                    {formatRelative(act.updatedAt, t)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function BucketDetail({
  label,
  sub,
  objects,
  graph,
  indexes,
  selectedId,
  onSelect,
  t,
}: {
  label: string;
  sub: string;
  objects: WorkGraphObjectSummary[];
  graph: WorkGraphProjection;
  indexes: ReturnType<typeof buildIndexes>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  t: ReturnType<typeof useI18n>["t"];
}): JSX.Element {
  return (
    <section className="bucketDetail">
      <header className="bucketDetail__head">
        <h2>{label}</h2>
        <p>{sub}</p>
      </header>
      {objects.length === 0 ? (
        <p className="bucketDetail__empty">
          {t("workTopdownCockpitNoBucketItems")}
        </p>
      ) : (
        <div className="bucketDetail__body">
          <div className="bucketDetail__main">
            <div className="bucketDetail__list">
              {objects.map((o) => (
                <WorkObjectCard
                  key={o.id}
                  object={o}
                  evidence={pickEvidence(indexes, o.id)}
                  gates={indexes.gatesBySubject.get(o.id) ?? []}
                  selected={selectedId === o.id}
                  onSelect={(next) =>
                    onSelect(selectedId === next ? null : next)
                  }
                />
              ))}
            </div>
          </div>
          <BlockersRail
            rows={objects}
            links={graph.links}
            indexes={indexes}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
      )}
    </section>
  );
}

function TeamsLanes({
  lanes,
  indexes,
  selectedId,
  onSelect,
  t,
}: {
  lanes: Array<{ role: string; items: WorkGraphObjectSummary[] }>;
  indexes: ReturnType<typeof buildIndexes>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  t: ReturnType<typeof useI18n>["t"];
}): JSX.Element {
  if (lanes.length === 0) {
    return (
      <p className="bucketDetail__empty">
        {t("workTopdownCockpitNoActorRoles")}
      </p>
    );
  }
  return (
    <div className="teamsLanes">
      {lanes.map((lane) => (
        <section key={lane.role} className="teamsLanes__lane" aria-label={lane.role}>
          <header className="teamsLanes__head">
            <h3>{lane.role}</h3>
            <span className="teamsLanes__count">{lane.items.length}</span>
          </header>
          <div className="teamsLanes__body">
            {lane.items.map((o) => (
              <WorkObjectCard
                key={o.id}
                object={o}
                evidence={pickEvidence(indexes, o.id)}
                gates={indexes.gatesBySubject.get(o.id) ?? []}
                selected={selectedId === o.id}
                onSelect={(next) =>
                  onSelect(selectedId === next ? null : next)
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
