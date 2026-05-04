import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import { nameInitials } from '../../../shared/nameInitials.js';
import type { PlatformLobbyCatSummary } from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';

type SectionKey = 'cats' | 'clowders' | 'catteries';

const SECTION_LABEL_KEY: Record<SectionKey, MessageKey> = {
  cats: messageKeys.lobbySidebarSectionCats,
  clowders: messageKeys.lobbySidebarSectionClowders,
  catteries: messageKeys.lobbySidebarSectionCatteries,
};

const SECTION_NEW_LABEL_KEY: Record<SectionKey, MessageKey> = {
  cats: messageKeys.lobbySidebarNewCat,
  clowders: messageKeys.lobbySidebarNewClowder,
  catteries: messageKeys.lobbySidebarNewCattery,
};

const SECTION_EMPTY_LABEL_KEY: Record<SectionKey, MessageKey> = {
  cats: messageKeys.lobbySidebarEmptyCats,
  clowders: messageKeys.lobbySidebarEmptyClowders,
  catteries: messageKeys.lobbySidebarEmptyCatteries,
};

const STORAGE_KEY_PREFIX = 'lobbySidebar.section.';

function storageKeyFor(section: SectionKey): string {
  return `${STORAGE_KEY_PREFIX}${section}.expanded`;
}

function readStoredExpanded(section: SectionKey): boolean | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const value = window.localStorage.getItem(storageKeyFor(section));
    if (value === null) return null;
    return value === 'true';
  } catch {
    return null;
  }
}

function persistExpanded(section: SectionKey, expanded: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(storageKeyFor(section), expanded ? 'true' : 'false');
  } catch {
    // localStorage write may fail under quota or private mode; collapse is
    // a UI-only preference, swallow.
  }
}

function useSectionExpanded(section: SectionKey): [boolean, () => void] {
  const [expanded, setExpanded] = useState<boolean>(() => {
    const stored = readStoredExpanded(section);
    return stored ?? false;
  });

  useEffect(() => {
    persistExpanded(section, expanded);
  }, [section, expanded]);

  const toggle = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  return [expanded, toggle];
}

function CatRowAvatar({ cat }: { cat: PlatformLobbyCatSummary }) {
  const style = cat.avatarUrl
    ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : cat.avatarColor
      ? { background: cat.avatarColor }
      : undefined;
  return (
    <span
      className={cat.isBoss ? 'lobbySidebarAvatar catAvatarBoss' : 'lobbySidebarAvatar'}
      style={style}
    >
      {cat.avatarUrl ? null : nameInitials(cat.name)}
    </span>
  );
}

function SidebarSection({
  section,
  count,
  children,
}: {
  section: SectionKey;
  count: number;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [expanded, toggle] = useSectionExpanded(section);
  const sectionLabel = t(SECTION_LABEL_KEY[section]);
  const toggleAriaLabel = expanded
    ? t(messageKeys.lobbySidebarToggleCollapse, { section: sectionLabel })
    : t(messageKeys.lobbySidebarToggleExpand, { section: sectionLabel });

  return (
    <section className={expanded ? 'lobbySidebarSection lobbySidebarSectionExpanded' : 'lobbySidebarSection'}>
      <button
        type="button"
        className="lobbySidebarSectionHeader"
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={toggleAriaLabel}
        data-section={section}
      >
        <span className="lobbySidebarSectionChevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="lobbySidebarSectionLabel">{sectionLabel}</span>
        <span className="lobbySidebarSectionCount">({count})</span>
      </button>
      {expanded ? <div className="lobbySidebarSectionBody">{children}</div> : null}
    </section>
  );
}

function NewEntityRow({
  section,
  onClick,
}: {
  section: SectionKey;
  onClick?: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="lobbySidebarNewRow"
      onClick={onClick}
      data-section={section}
    >
      {t(SECTION_NEW_LABEL_KEY[section])}
    </button>
  );
}

export interface LobbySidebarProps {
  cats: readonly PlatformLobbyCatSummary[];
  // Phase 6 (ADR-100 + SPEC-103) lands the real Clowder / Cattery
  // registries. Until then the sections are reachable but render their
  // empty state. Keep them as plain `readonly unknown[]` so this
  // component does not couple to a future shape that may change.
  clowders?: readonly unknown[];
  catteries?: readonly unknown[];
  onCreateCat?: () => void;
  onCreateClowder?: () => void;
  onCreateCattery?: () => void;
}

export function LobbySidebar({
  cats,
  clowders = [],
  catteries = [],
  onCreateCat,
  onCreateClowder,
  onCreateCattery,
}: LobbySidebarProps) {
  const { t } = useI18n();

  return (
    <aside className="lobbySidebar" aria-label={t(messageKeys.lobbySidebarAriaLabel)}>
      <SidebarSection section="cats" count={cats.length}>
        {cats.length === 0 ? (
          <p className="lobbySidebarEmpty">{t(SECTION_EMPTY_LABEL_KEY.cats)}</p>
        ) : (
          <ul className="lobbySidebarItems">
            {cats.map((cat) => (
              <li key={cat.id} className="lobbySidebarItem">
                <Link
                  to={`/cats/${encodeURIComponent(cat.id)}`}
                  className="lobbySidebarRow"
                  aria-label={t(messageKeys.lobbySidebarRowAriaCat, { catName: cat.name })}
                >
                  <CatRowAvatar cat={cat} />
                  <span className="lobbySidebarRowName">{cat.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <NewEntityRow section="cats" onClick={onCreateCat} />
      </SidebarSection>

      <SidebarSection section="clowders" count={clowders.length}>
        {clowders.length === 0 ? (
          <p className="lobbySidebarEmpty">{t(SECTION_EMPTY_LABEL_KEY.clowders)}</p>
        ) : null}
        <NewEntityRow section="clowders" onClick={onCreateClowder} />
      </SidebarSection>

      <SidebarSection section="catteries" count={catteries.length}>
        {catteries.length === 0 ? (
          <p className="lobbySidebarEmpty">{t(SECTION_EMPTY_LABEL_KEY.catteries)}</p>
        ) : null}
        <NewEntityRow section="catteries" onClick={onCreateCattery} />
      </SidebarSection>
    </aside>
  );
}
