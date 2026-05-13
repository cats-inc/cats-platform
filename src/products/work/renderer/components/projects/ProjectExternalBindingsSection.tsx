import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import {
  formatRelative,
  formatWorkExternalBindingLabel,
  isSafeExternalBindingUrl,
} from "../topdown/shared";
import type { WorkGraphExternalBindingSummary } from "../topdown/types";

export function ProjectExternalBindingsSection({
  bindings,
}: {
  bindings: readonly WorkGraphExternalBindingSummary[];
}): JSX.Element | null {
  const { t } = useI18n();
  if (bindings.length === 0) {
    return null;
  }

  return (
    <section className="projectDetail__section projectDetail__external">
      <header className="projectDetail__sectionHeader">
        <h2>{t("workTopdownExternalTitle")}</h2>
        <span className="projectDetail__sectionCount">{bindings.length}</span>
      </header>
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
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
