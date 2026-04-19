import type { ReactElement, ReactNode } from 'react';

interface SettingsSectionCommonProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'form';
  id?: string;
}

interface SettingsSectionWithHeaderProps extends SettingsSectionCommonProps {
  /** Required JSX element. Typed as ReactElement (not ReactNode) so callers
   * cannot pass `null` / `undefined` / `false` and silently bypass the
   * "every section has a header" contract. To intentionally omit, use
   * `headerless`. */
  header: ReactElement;
  headerless?: false;
}

interface SettingsSectionHeaderlessProps extends SettingsSectionCommonProps {
  headerless: true;
  header?: never;
}

export type SettingsSectionProps =
  | SettingsSectionWithHeaderProps
  | SettingsSectionHeaderlessProps;

export function SettingsSection(props: SettingsSectionProps) {
  const { children, className, variant = 'default', id } = props;
  const merged = [
    'contentCard',
    variant === 'form' ? 'contentCardForm' : null,
    'settings-section',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section
      className={merged}
      data-variant={variant === 'form' ? 'form' : undefined}
      id={id}
    >
      {props.headerless ? null : props.header}
      {children}
    </section>
  );
}
