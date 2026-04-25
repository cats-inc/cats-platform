import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { MOCK_WORK_GRAPH } from "./mock";
import { buildIndexes, formatRelative } from "./shared";
import type {
  WorkAttentionState,
  WorkGraphObjectKind,
  WorkGraphObjectSummary,
} from "./types";
import { WorkObjectCard, pickEvidence } from "./WorkObjectCard";
import { WorkObjectDrawer } from "./WorkObjectDrawer";
import "./topdown.css";

type CockpitTab =
  | "command"
  | "needs-decision"
  | "active"
  | "blocked"
  | "shipped"
  | "teams";

const TABS: Array<{ id: CockpitTab; label: string; sub: string }> = [
  { id: "command", label: "Command Center", sub: "All buckets at a glance" },
  { id: "needs-decision", label: "Needs Decision", sub: "Owner action required" },
  { id: "active", label: "Active", sub: "In progress, on track" },
  { id: "blocked", label: "Blocked", sub: "Stalled or failed" },
  { id: "shipped", label: "Shipped", sub: "Recently completed" },
  { id: "teams", label: "Teams · Roles", sub: "Grouped by resolved actor role" },
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

type BucketId = "needs-decision" | "active" | "blocked" | "shipped";

export function CockpitPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as CockpitTab | null) ?? "command";
  const selectedId = searchParams.get("selectedId");
  const graph = MOCK_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);

  const buckets = useMemo(() => {
    const out: Record<BucketId, WorkGraphObjectSummary[]> = {
      "needs-decision": [],
      active: [],
      blocked: [],
      shipped: [],
    };
    for (const o of graph.objects) {
      if (!OPERATIONAL_KINDS.includes(o.kind)) continue;
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

  const counts = {
    "needs-decision": buckets["needs-decision"].length,
    active: buckets.active.length,
    blocked: buckets.blocked.length,
    shipped: buckets.shipped.length,
    teams: teamLanes.length,
  };

  return (
    <div className="topDownPage">
      <header className="channelTopBar topDownTopBar">
        <div className="channelTopBarStart topDownTopBar__start">
          <span className="topDownTopBar__eyebrow">Top-down · operational</span>
          <h1 className="channelTopBarTitle topDownTopBar__title">Cockpit</h1>
        </div>
        <div className="channelTopBarCenter topDownTopBar__center">
          <p className="topDownTopBar__lede">
            Triage what needs you now. Same Work Graph, grouped by attention
            state instead of by structural layer.
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
            <strong>{counts["needs-decision"]}</strong> decisions
          </span>
          <span
            className={
              "topDownTopBar__metric" +
              (counts.blocked > 0 ? " topDownTopBar__metric--bad" : "")
            }
          >
            <strong>{counts.blocked}</strong> blocked
          </span>
          <span className="topDownTopBar__metric">
            <strong>{counts.shipped}</strong> shipped
          </span>
        </div>
      </header>
      <nav className="cockpit__tabs" aria-label="Cockpit sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={
              "cockpit__tab" + (tab === t.id ? " cockpit__tab--active" : "")
            }
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
          >
            <span className="cockpit__tabLabel">{t.label}</span>
            <span className="cockpit__tabSub">{t.sub}</span>
            {t.id !== "command" && t.id !== "teams" ? (
              <span className="cockpit__tabCount">
                {counts[t.id as BucketId]}
              </span>
            ) : null}
            {t.id === "teams" ? (
              <span className="cockpit__tabCount">{counts.teams}</span>
            ) : null}
          </button>
        ))}
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
          />
        ) : tab === "teams" ? (
          <TeamsLanes
            lanes={teamLanes}
            indexes={indexes}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <BucketDetail
            label={TABS.find((t) => t.id === tab)?.label ?? ""}
            sub={TABS.find((t) => t.id === tab)?.sub ?? ""}
            objects={buckets[tab as BucketId]}
            indexes={indexes}
            selectedId={selectedId}
            onSelect={setSelectedId}
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
}: {
  graph: typeof MOCK_WORK_GRAPH;
  buckets: Record<BucketId, WorkGraphObjectSummary[]>;
  indexes: ReturnType<typeof buildIndexes>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onJump: (id: CockpitTab) => void;
}): JSX.Element {
  const ORDER: BucketId[] = ["needs-decision", "blocked", "active", "shipped"];
  const recentActivity = graph.objects
    .filter((o) => o.kind === "activity")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  return (
    <div className="commandCenter">
      <div className="commandCenter__grid">
        {ORDER.map((id) => (
          <section
            key={id}
            className="commandCenter__bucket"
            data-bucket={id}
            aria-label={id}
          >
            <header className="commandCenter__bucketHead">
              <h3>{TABS.find((t) => t.id === id)?.label}</h3>
              <span className="commandCenter__bucketCount">
                {buckets[id].length}
              </span>
              <button
                type="button"
                className="commandCenter__seeMore"
                onClick={() => onJump(id)}
              >
                Open →
              </button>
            </header>
            <div className="commandCenter__bucketBody">
              {buckets[id].length === 0 ? (
                <p className="commandCenter__empty">
                  Nothing in this bucket.
                </p>
              ) : (
                buckets[id].slice(0, 3).map((o) => (
                  <WorkObjectCard
                    key={o.id}
                    object={o}
                    evidence={pickEvidence(indexes, o.id)}
                    gates={indexes.gatesBySubject.get(o.id) ?? []}
                    selected={selectedId === o.id}
                    onSelect={(next) => onSelect(selectedId === next ? null : next)}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
      <aside className="commandCenter__rail" aria-label="Recent activity">
        <header className="commandCenter__railHead">
          <h3>Recent activity</h3>
          <p>Last {recentActivity.length} activity-kind records.</p>
        </header>
        {recentActivity.length === 0 ? (
          <p className="commandCenter__empty">No activity yet.</p>
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
                    {formatRelative(act.updatedAt)}
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
  indexes,
  selectedId,
  onSelect,
}: {
  label: string;
  sub: string;
  objects: WorkGraphObjectSummary[];
  indexes: ReturnType<typeof buildIndexes>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): JSX.Element {
  return (
    <section className="bucketDetail">
      <header className="bucketDetail__head">
        <h2>{label}</h2>
        <p>{sub}</p>
      </header>
      {objects.length === 0 ? (
        <p className="bucketDetail__empty">Nothing in this bucket right now.</p>
      ) : (
        <div className="bucketDetail__list">
          {objects.map((o) => (
            <WorkObjectCard
              key={o.id}
              object={o}
              evidence={pickEvidence(indexes, o.id)}
              gates={indexes.gatesBySubject.get(o.id) ?? []}
              selected={selectedId === o.id}
              onSelect={(next) => onSelect(selectedId === next ? null : next)}
            />
          ))}
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
}: {
  lanes: Array<{ role: string; items: WorkGraphObjectSummary[] }>;
  indexes: ReturnType<typeof buildIndexes>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): JSX.Element {
  if (lanes.length === 0) {
    return (
      <p className="bucketDetail__empty">
        No actor roles resolve in the current projection.
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
