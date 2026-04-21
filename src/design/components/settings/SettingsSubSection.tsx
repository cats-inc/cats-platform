import type { ReactElement, ReactNode } from 'react';

interface SettingsSubSectionCommonProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

interface SettingsSubSectionWithHeaderProps extends SettingsSubSectionCommonProps {
  header: ReactElement;
  headerless?: false;
}

interface SettingsSubSectionHeaderlessProps extends SettingsSubSectionCommonProps {
  headerless: true;
  header?: never;
}

export type SettingsSubSectionProps =
  | SettingsSubSectionWithHeaderProps
  | SettingsSubSectionHeaderlessProps;

export function SettingsSubSection(props: SettingsSubSectionProps) {
  const { children, className, id } = props;
  const merged = [
    'settings-sub-section',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={merged} id={id}>
      {props.headerless ? null : props.header}
      {children}
    </section>
  );
}
