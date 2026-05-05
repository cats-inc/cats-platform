import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';

type EntityCanvasKind = 'clowders' | 'catteries';

interface EntityCanvasMetric {
  key: string;
  label: string;
  value: string | number;
}

interface EntityCanvasRelation {
  key: string;
  label: string;
  value: string;
  href?: string;
}

interface EntityCanvasEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  routePath: string;
  subtitle: string;
  metrics: readonly EntityCanvasMetric[];
  detailMetrics: readonly EntityCanvasMetric[];
  relations: readonly EntityCanvasRelation[];
}

function compareEntityCanvasEntries(
  left: EntityCanvasEntry,
  right: EntityCanvasEntry,
): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdAtOrder !== 0) return createdAtOrder;
  const nameOrder = left.name.localeCompare(right.name);
  if (nameOrder !== 0) return nameOrder;
  return left.id.localeCompare(right.id);
}

function formatCreatedAt(value: string): string {
  return value.slice(0, 10) || value;
}

function EntityCanvasAvatar({ entry }: { entry: EntityCanvasEntry }) {
  const style = entry.avatarUrl
    ? {
        backgroundImage: `url(${entry.avatarUrl})`,
        backgroundSize: 'cover' as const,
        backgroundPosition: 'center' as const,
      }
    : undefined;

  return (
    <span className="entityCanvasAvatar" style={style}>
      {entry.avatarUrl ? null : nameInitials(entry.name)}
    </span>
  );
}

function EntityCanvasMetricList({
  metrics,
  className,
}: {
  metrics: readonly EntityCanvasMetric[];
  className: string;
}) {
  return (
    <dl className={className}>
      {metrics.map((metric) => (
        <div key={metric.key}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EntityCanvasRelations({
  relations,
  emptyLabel,
}: {
  relations: readonly EntityCanvasRelation[];
  emptyLabel: string;
}) {
  if (relations.length === 0) {
    return <p className="entityCanvasDetailEmpty">{emptyLabel}</p>;
  }

  return (
    <ul className="entityCanvasRelationList">
      {relations.map((relation) => (
        <li key={relation.key}>
          <span>{relation.label}</span>
          {relation.href ? (
            <Link to={relation.href}>{relation.value}</Link>
          ) : (
            <strong>{relation.value}</strong>
          )}
        </li>
      ))}
    </ul>
  );
}

function EntityCanvasPage({
  kind,
  entries,
  titleKey,
  eyebrowKey,
  emptyStateKey,
  ariaLabelKey,
  detailHeadingKey,
  relationHeadingKey,
  relationEmptyKey,
  openActionKey,
  totals,
}: {
  kind: EntityCanvasKind;
  entries: readonly EntityCanvasEntry[];
  titleKey: MessageKey;
  eyebrowKey: MessageKey;
  emptyStateKey: MessageKey;
  ariaLabelKey: MessageKey;
  detailHeadingKey: MessageKey;
  relationHeadingKey: MessageKey;
  relationEmptyKey: MessageKey;
  openActionKey: MessageKey;
  totals: readonly EntityCanvasMetric[];
}) {
  const { t } = useI18n();
  const sortedEntries = useMemo(
    () => [...entries].sort(compareEntityCanvasEntries),
    [entries],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedEntry =
    sortedEntries.find((entry) => entry.id === selectedId)
    ?? sortedEntries[0]
    ?? null;

  return (
    <div className={`entityCanvas entityCanvas--${kind}`} aria-label={t(ariaLabelKey)}>
      <header className="entityCanvasHeader">
        <div>
          <p className="eyebrow">{t(eyebrowKey)}</p>
          <h1 className="entityCanvasTitle">{t(titleKey)}</h1>
        </div>
        {totals.length > 0 ? (
          <EntityCanvasMetricList
            metrics={totals}
            className="entityCanvasTotals"
          />
        ) : null}
      </header>

      {sortedEntries.length === 0 ? (
        <section className="contentCard entityCanvasEmpty">
          <p>{t(emptyStateKey)}</p>
        </section>
      ) : (
        <div className="entityCanvasBody">
          <section className="contentCard entityCanvasRegistry" aria-label={t(titleKey)}>
            <ul className="entityCanvasRows">
              {sortedEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={
                      selectedEntry?.id === entry.id
                        ? 'entityCanvasRow entityCanvasRowActive'
                        : 'entityCanvasRow'
                    }
                    onClick={() => setSelectedId(entry.id)}
                    aria-current={selectedEntry?.id === entry.id ? 'page' : undefined}
                  >
                    <EntityCanvasAvatar entry={entry} />
                    <span className="entityCanvasRowText">
                      <span className="entityCanvasRowName">{entry.name}</span>
                      <span className="entityCanvasRowSubtitle">{entry.subtitle}</span>
                    </span>
                    <EntityCanvasMetricList
                      metrics={entry.metrics}
                      className="entityCanvasRowMetrics"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {selectedEntry ? (
            <aside className="contentCard entityCanvasDetail" aria-label={selectedEntry.name}>
              <header className="entityCanvasDetailHeader">
                <EntityCanvasAvatar entry={selectedEntry} />
                <div>
                  <p className="eyebrow">{t(detailHeadingKey)}</p>
                  <h2>{selectedEntry.name}</h2>
                </div>
              </header>
              <EntityCanvasMetricList
                metrics={[
                  ...selectedEntry.detailMetrics,
                  {
                    key: 'createdAt',
                    label: t(messageKeys.entityCanvasCreatedLabel),
                    value: formatCreatedAt(selectedEntry.createdAt),
                  },
                  {
                    key: 'id',
                    label: t(messageKeys.entityCanvasIdLabel),
                    value: selectedEntry.id,
                  },
                ]}
                className="entityCanvasDetailMeta"
              />
              <section className="entityCanvasRelationSection">
                <h3>{t(relationHeadingKey)}</h3>
                <EntityCanvasRelations
                  relations={selectedEntry.relations}
                  emptyLabel={t(relationEmptyKey)}
                />
              </section>
              <Link
                className="secondaryButton entityCanvasOpenLink"
                to={selectedEntry.routePath}
              >
                {t(openActionKey)}
              </Link>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}

function summarizeTotals(metrics: readonly EntityCanvasMetric[]): EntityCanvasMetric[] {
  return metrics.filter((metric) => Number(metric.value) > 0);
}

export function ClowdersCanvasPage({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const catteriesById = new Map(
    (envelope.lobby.catteries ?? []).map((cattery) => [cattery.id, cattery]),
  );
  const clowders = envelope.lobby.clowders ?? [];
  const entries = clowders.map((clowder): EntityCanvasEntry => {
    const parentCattery = clowder.parentCatteryId
      ? catteriesById.get(clowder.parentCatteryId) ?? null
      : null;
    const parentCatteryLabel = parentCattery?.name ?? clowder.parentCatteryId;
    return {
      id: clowder.id,
      name: clowder.name,
      avatarUrl: clowder.avatarUrl,
      createdAt: clowder.createdAt,
      routePath: `/entities/clowders/${encodeURIComponent(clowder.id)}`,
      subtitle: parentCatteryLabel
        ? t(messageKeys.clowderHomeChipPartOf, { catteryName: parentCatteryLabel })
        : t(messageKeys.clowderHomeChipCrossUnit),
      metrics: [
        {
          key: 'cats',
          label: t(messageKeys.entityCanvasCatsLabel),
          value: clowder.catCount,
        },
        {
          key: 'members',
          label: t(messageKeys.entityCanvasMembersLabel),
          value: clowder.memberCount,
        },
      ],
      detailMetrics: [
        {
          key: 'cats',
          label: t(messageKeys.entityCanvasCatsLabel),
          value: clowder.catCount,
        },
        {
          key: 'members',
          label: t(messageKeys.entityCanvasMembersLabel),
          value: clowder.memberCount,
        },
      ],
      relations: [
        parentCatteryLabel
          ? {
              key: 'parentCattery',
              label: t(messageKeys.entityCanvasParentCatteryLabel),
              value: parentCatteryLabel,
              href: parentCattery
                ? `/entities/catteries/${encodeURIComponent(parentCattery.id)}`
                : undefined,
            }
          : {
              key: 'parentCattery',
              label: t(messageKeys.entityCanvasParentCatteryLabel),
              value: t(messageKeys.clowderHomeChipCrossUnit),
            },
      ],
    };
  });

  return (
    <EntityCanvasPage
      kind="clowders"
      entries={entries}
      titleKey={messageKeys.clowdersListTitle}
      eyebrowKey={messageKeys.clowdersListEyebrow}
      emptyStateKey={messageKeys.clowdersListEmptyState}
      ariaLabelKey={messageKeys.clowdersCanvasAriaLabel}
      detailHeadingKey={messageKeys.entityCanvasSelectedClowderLabel}
      relationHeadingKey={messageKeys.entityCanvasOrganizationLabel}
      relationEmptyKey={messageKeys.entityCanvasNoOrganizationLabel}
      openActionKey={messageKeys.entityCanvasOpenClowderAction}
      totals={summarizeTotals([
        {
          key: 'total',
          label: t(messageKeys.entityCanvasTotalLabel),
          value: clowders.length,
        },
        {
          key: 'cats',
          label: t(messageKeys.entityCanvasCatsLabel),
          value: clowders.reduce((total, clowder) => total + clowder.catCount, 0),
        },
        {
          key: 'members',
          label: t(messageKeys.entityCanvasMembersLabel),
          value: clowders.reduce((total, clowder) => total + clowder.memberCount, 0),
        },
      ])}
    />
  );
}

export function CatteriesCanvasPage({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();
  const clowders = envelope.lobby.clowders ?? [];
  const catteries = envelope.lobby.catteries ?? [];
  const entries = catteries.map((cattery): EntityCanvasEntry => {
    const formalClowders = clowders.filter(
      (clowder) => clowder.parentCatteryId === cattery.id,
    );
    return {
      id: cattery.id,
      name: cattery.name,
      avatarUrl: cattery.avatarUrl,
      createdAt: cattery.createdAt,
      routePath: `/entities/catteries/${encodeURIComponent(cattery.id)}`,
      subtitle: t(messageKeys.entityCanvasCatterySubtitle, {
        clowderCount: String(cattery.clowderCount),
        memberCount: String(cattery.memberCount),
      }),
      metrics: [
        {
          key: 'members',
          label: t(messageKeys.entityCanvasMembersLabel),
          value: cattery.memberCount,
        },
        {
          key: 'clowders',
          label: t(messageKeys.entityCanvasClowdersLabel),
          value: cattery.clowderCount,
        },
      ],
      detailMetrics: [
        {
          key: 'members',
          label: t(messageKeys.entityCanvasMembersLabel),
          value: cattery.memberCount,
        },
        {
          key: 'clowders',
          label: t(messageKeys.entityCanvasClowdersLabel),
          value: cattery.clowderCount,
        },
        {
          key: 'cats',
          label: t(messageKeys.entityCanvasCatsLabel),
          value: cattery.catCount,
        },
      ],
      relations: formalClowders.map((clowder) => ({
        key: clowder.id,
        label: t(messageKeys.entityCanvasFormalClowderLabel),
        value: clowder.name,
        href: `/entities/clowders/${encodeURIComponent(clowder.id)}`,
      })),
    };
  });

  return (
    <EntityCanvasPage
      kind="catteries"
      entries={entries}
      titleKey={messageKeys.catteriesListTitle}
      eyebrowKey={messageKeys.catteriesListEyebrow}
      emptyStateKey={messageKeys.catteriesListEmptyState}
      ariaLabelKey={messageKeys.catteriesCanvasAriaLabel}
      detailHeadingKey={messageKeys.entityCanvasSelectedCatteryLabel}
      relationHeadingKey={messageKeys.entityCanvasOrganizationLabel}
      relationEmptyKey={messageKeys.entityCanvasNoFormalClowdersLabel}
      openActionKey={messageKeys.entityCanvasOpenCatteryAction}
      totals={summarizeTotals([
        {
          key: 'total',
          label: t(messageKeys.entityCanvasTotalLabel),
          value: catteries.length,
        },
        {
          key: 'members',
          label: t(messageKeys.entityCanvasMembersLabel),
          value: catteries.reduce((total, cattery) => total + cattery.memberCount, 0),
        },
        {
          key: 'clowders',
          label: t(messageKeys.entityCanvasClowdersLabel),
          value: catteries.reduce((total, cattery) => total + cattery.clowderCount, 0),
        },
      ])}
    />
  );
}
