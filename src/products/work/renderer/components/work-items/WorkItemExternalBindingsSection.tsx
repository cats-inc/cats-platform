import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import {
  formatRelative,
  formatWorkExternalBindingLabel,
  isSafeExternalBindingUrl,
} from "../topdown/shared";
import type { WorkGraphExternalBindingSummary } from "../topdown/types";

export function WorkItemExternalBindingsSection({
  addLabel,
  bindings,
  emptyLabel,
  onAddClick,
}: {
  addLabel?: string;
  bindings: readonly WorkGraphExternalBindingSummary[];
  emptyLabel?: string;
  onAddClick?: () => void;
}): JSX.Element | null {
  const { t } = useI18n();
  if (bindings.length === 0 && !onAddClick) {
    return null;
  }

  return (
    <section className="workItemDetail__section workItemDetail__external">
      <header className="workItemDetail__sectionHeader">
        <h2>{t("workTopdownExternalTitle")}</h2>
        <span className="workItemDetail__sectionCount">{bindings.length}</span>
        {onAddClick ? (
          <button
            type="button"
            className="workItemDetail__sectionAction"
            onClick={onAddClick}
          >
            {addLabel ?? t("workItemExternalLinkAction")}
          </button>
        ) : null}
      </header>
      {bindings.length === 0 ? (
        <p className="workItemDetail__empty">
          {emptyLabel ?? t("workItemExternalEmpty")}
        </p>
      ) : (
        <ul className="workItemDetail__externalRefs">
          {bindings.map((binding) => {
            const label = formatWorkExternalBindingLabel(binding);
            const safeUrl = isSafeExternalBindingUrl(binding.externalUrl)
              ? binding.externalUrl
              : null;
            return (
              <li
                key={`${binding.provider}:${binding.externalType}:${binding.externalId}`}
                className="workItemDetail__externalRef"
              >
                <span className="workItemDetail__externalProvider">
                  {binding.provider}
                </span>
                <span className="workItemDetail__externalMain">
                  {safeUrl ? (
                    <a
                      className="workItemDetail__externalLink"
                      href={safeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {label}
                    </a>
                  ) : (
                    <span className="workItemDetail__externalLabel">
                      {label}
                    </span>
                  )}
                  <span className="workItemDetail__externalMeta">
                    {t("workTopdownExternalSyncLabel", {
                      syncDirection: binding.syncDirection,
                    })}
                    {binding.externalUpdatedAt
                      ? ` - ${t("workTopdownExternalUpdatedLabel", {
                        updatedAt: formatRelative(binding.externalUpdatedAt, t),
                      })}`
                      : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
