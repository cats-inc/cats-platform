import React, { type ReactNode } from 'react';

export interface SettingsOptionRowProps {
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  layout?: 'inline' | 'stack';
  asChoice?: boolean;
  className?: string;
}

export function SettingsOptionRow({
  label,
  description,
  control,
  layout = 'inline',
  asChoice = false,
  className,
}: SettingsOptionRowProps) {
  if (asChoice) {
    const merged = [
      'settingsCheckboxRow',
      'settings-option-row',
      className,
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <label className={merged} data-layout={layout} data-choice="true">
        {control}
        <span className="settingsCheckboxMeta settings-option-row__meta">
          <span className="settingsCheckboxLabel settings-option-row__label">
            {label}
          </span>
          {description ? (
            <span className="heroNote settings-option-row__description">
              {description}
            </span>
          ) : null}
        </span>
      </label>
    );
  }

  const merged = ['settings-option-row', className].filter(Boolean).join(' ');

  if (layout === 'stack') {
    return (
      <div className={merged} data-layout="stack">
        <span className="settings-option-row__label">{label}</span>
        {description ? (
          <span className="settings-option-row__description">{description}</span>
        ) : null}
        <div className="settings-option-row__control">{control}</div>
      </div>
    );
  }

  return (
    <div className={merged} data-layout="inline">
      <div className="settings-option-row__meta">
        <span className="settings-option-row__label">{label}</span>
        {description ? (
          <span className="settings-option-row__description">{description}</span>
        ) : null}
      </div>
      <div className="settings-option-row__control">{control}</div>
    </div>
  );
}
