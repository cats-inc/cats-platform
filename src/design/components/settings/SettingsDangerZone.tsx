import type { ReactElement, ReactNode } from 'react';

import type {
  SettingsActionBar,
  SettingsActionBarProps,
} from './SettingsActionBar.js';

/** The `<button>` / `<SettingsActionBar>` forms that the section's row
 * rhythm lays out correctly. Typed as a discriminated union on the
 * element's intrinsic/component type so `<>…</>` fragments, `<div>`
 * wrappers, and children arrays are rejected at compile time — plain
 * `ReactElement` would accept `React.Fragment` and the two-button
 * footgun would compile again. */
type SettingsDangerZoneAction =
  | ReactElement<unknown, 'button'>
  | ReactElement<SettingsActionBarProps, typeof SettingsActionBar>;

export interface SettingsDangerZoneProps {
  title: string;
  description?: ReactNode;
  /** Either a bare `<button className="dangerButton">` for a single
   * destructive action, or a `<SettingsActionBar>` wrapping multiple
   * buttons. Other shapes — fragments, `<div>`, arbitrary components,
   * multiple bare children — do not type-check. */
  children: SettingsDangerZoneAction;
  className?: string;
}

export function SettingsDangerZone({
  title,
  description,
  children,
  className,
}: SettingsDangerZoneProps) {
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
