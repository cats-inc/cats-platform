import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import {
  formatRelative,
  formatWorkExternalBindingLabel,
  isSafeExternalBindingUrl,
} from "../topdown/shared";
import type { WorkGraphExternalBindingSummary } from "../topdown/types";

export function ProjectExternalBindingsSection({
  addLabel,
  bindings,
  emptyLabel,
  onAddClick,
  onRemoveBinding,
  removeDisabled,
}: {
  addLabel?: string;
  bindings: readonly WorkGraphExternalBindingSummary[];
  emptyLabel?: string;
  onAddClick?: () => void;
  onRemoveBinding?: (binding: WorkGraphExternalBindingSummary) => void;
  removeDisabled?: boolean;
}): JSX.Element | null {
  const { t } = useI18n();
  if (bindings.length === 0 && !onAddClick) {
    return null;
  }

  return (
    <section className="projectDetail__section projectDetail__external">
      <header className="projectDetail__sectionHeader">
        <h2>{t("workTopdownExternalTitle")}</h2>
        <span className="projectDetail__sectionCount">{bindings.length}</span>
        {onAddClick ? (
          <button
            type="button"
            className="projectDetail__sectionAction"
            onClick={onAddClick}
          >
            {addLabel ?? t("workExternalLinkTrackerAction")}
          </button>
        ) : null}
      </header>
      {bindings.length === 0 ? (
        <p className="projectDetail__empty">
          {emptyLabel ?? t("workExternalEmpty")}
        </p>
      ) : (
        <ul className="projectDetail__externalRefs">
          {bindings.map((binding) => {
            const label = formatWorkExternalBindingLabel(binding);
            const safeUrl = isSafeExternalBindingUrl(binding.externalUrl)
              ? binding.externalUrl
              : null;
            return (
              <li
                key={`${binding.provider}:${binding.externalType}:${binding.externalId}`}
                className="projectDetail__externalRef"
              >
                <span className="projectDetail__externalProvider">
                  {binding.provider}
                </span>
                <span className="projectDetail__externalMain">
                  {safeUrl ? (
                    <a
                      className="projectDetail__externalLink"
                      href={safeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {label}
                    </a>
                  ) : (
                    <span className="projectDetail__externalLabel">
                      {label}
                    </span>
                  )}
                  <span className="projectDetail__externalMeta">
                    {t("workTopdownExternalSyncLabel", {
                      syncDirection: binding.syncDirection,
                    })}
                    {binding.externalUpdatedAt
                      ? ` - ${t("workTopdownExternalUpdatedLabel", {
                        updatedAt: formatRelative(binding.externalUpdatedAt, t),
                      })}`
                      : ""}
                  </span>
                  {onRemoveBinding ? (
                    <button
                      type="button"
                      className="projectDetail__externalRemove"
                      onClick={() => onRemoveBinding(binding)}
                      disabled={removeDisabled}
                      aria-label={t("workExternalUnlinkAriaLabel", { label })}
                    >
                      {t("workExternalUnlinkAction")}
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
