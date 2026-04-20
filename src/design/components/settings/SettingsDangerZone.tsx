import { isValidElement, type ReactElement, type ReactNode } from 'react';

import {
  SettingsActionBar,
  type SettingsActionBarProps,
} from './SettingsActionBar.js';

/** The `<button>` / `<SettingsActionBar>` forms that the section's row
 * rhythm lays out correctly. Typed as a discriminated union on the
 * element's intrinsic/component type so `<>…</>` fragments, `<div>`
 * wrappers, and children arrays are rejected at compile time. Caveat:
 * TypeScript uses structural typing for function components, so a
 * look-alike wrapper whose props match `SettingsActionBarProps` can
 * still satisfy the second arm — the render-time guard below catches
 * that residual case in development builds. */
type SettingsDangerZoneAction =
  | ReactElement<unknown, 'button'>
  | ReactElement<SettingsActionBarProps, typeof SettingsActionBar>;

export interface SettingsDangerZoneProps {
  title: string;
  description?: ReactNode;
  /** Either a bare `<button className="dangerButton">` for a single
   * destructive action, or a `<SettingsActionBar>` wrapping multiple
   * buttons. Fragments, `<div>` wrappers, and children arrays are
   * rejected by the type. Dev builds also warn when a structurally-
   * compatible wrapper component sneaks past structural typing. */
  children: SettingsDangerZoneAction;
  className?: string;
}

function warnIfUnexpectedChild(children: ReactElement): void {
  if (!isValidElement(children)) return;
  const childType = children.type;
  if (childType === 'button' || childType === SettingsActionBar) return;

  let label: string;
  if (typeof childType === 'string') {
    label = `<${childType}>`;
  } else if (typeof childType === 'function') {
    const named = childType as { displayName?: string; name?: string };
    label = named.displayName ?? named.name ?? 'anonymous component';
  } else {
    label = 'special element (Fragment / context / portal)';
  }
  console.warn(
    `<SettingsDangerZone> expected a <button> or <SettingsActionBar>, got ${label}. ` +
      'Wrap multi-button rows in <SettingsActionBar> so they inherit the section row rhythm.',
  );
}

export function SettingsDangerZone({
  title,
  description,
  children,
  className,
}: SettingsDangerZoneProps) {
  if (process.env.NODE_ENV !== 'production') {
    warnIfUnexpectedChild(children);
  }
  const merged = [
    'contentCard',
    'settings-section',
    'settings-danger-zone',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={merged}>
      <h2 className="settings-danger-zone__title">{title}</h2>
      {description ? (
        <p className="settings-danger-zone__description">{description}</p>
      ) : null}
      {children}
    </section>
  );
}
