export interface TranscriptMessageActionMenuItem {
  key: string;
  label: string;
  disabled?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void;
}

export interface TranscriptMessageButtonActionDescriptor {
  key: string;
  kind?: 'button';
  title: string;
  ariaLabel?: string;
  disabled?: boolean;
  icon?: JSX.Element;
  onSelect: () => void;
}

export interface TranscriptMessageMenuActionDescriptor {
  key: string;
  kind: 'menu';
  title: string;
  ariaLabel?: string;
  disabled?: boolean;
  icon?: JSX.Element;
  open: boolean;
  onToggle: () => void;
  items: ReadonlyArray<TranscriptMessageActionMenuItem>;
}

export type TranscriptMessageActionDescriptor =
  | TranscriptMessageButtonActionDescriptor
  | TranscriptMessageMenuActionDescriptor;

export interface TranscriptMessageActionsProps {
  senderKind: string;
  showDefaultCopyAction?: boolean;
  copyActionLabel: string;
  onCopyMessage?: () => void;
  extraActions?: ReadonlyArray<TranscriptMessageActionDescriptor>;
}

export function CopyActionIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function RetryActionIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" />
    </svg>
  );
}

export function RelayActionIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

export function TranscriptMessageActions({
  senderKind,
  showDefaultCopyAction = false,
  copyActionLabel,
  onCopyMessage,
  extraActions = [],
}: TranscriptMessageActionsProps): JSX.Element | null {
  if (senderKind === 'system') {
    return null;
  }

  const showCopyAction = showDefaultCopyAction && onCopyMessage != null;
  if (!showCopyAction && extraActions.length === 0) {
    return null;
  }

  return (
    <div
      className={[
        'messageActions',
        senderKind === 'user'
          ? 'messageActionsHoverOnly'
          : 'messageActionsPersistent',
      ].join(' ')}
    >
      {extraActions.map((action) => {
        if (action.kind === 'menu') {
          return (
            <div key={action.key} className="messageActionMenu">
              <button
                className="messageActionIcon"
                type="button"
                disabled={action.disabled === true}
                title={action.title}
                aria-label={action.ariaLabel ?? action.title}
                onClick={action.onToggle}
              >
                {action.icon ?? <RelayActionIcon />}
              </button>
              {action.open ? (
                <div className="messageActionPopover">
                  {action.items.map((item) => (
                    <div key={item.key}>
                      {item.dividerBefore ? (
                        <div className="messageActionPopoverDivider" />
                      ) : null}
                      <button
                        type="button"
                        disabled={item.disabled === true}
                        onClick={item.onSelect}
                      >
                        {item.label}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }

        return (
          <button
            key={action.key}
            className="messageActionIcon"
            type="button"
            disabled={action.disabled === true}
            onClick={action.onSelect}
            title={action.title}
            aria-label={action.ariaLabel ?? action.title}
          >
            {action.icon}
          </button>
        );
      })}
      {showCopyAction ? (
        <button
          className="messageActionIcon"
          type="button"
          onClick={onCopyMessage}
          title={copyActionLabel}
          aria-label={copyActionLabel}
        >
          <CopyActionIcon />
        </button>
      ) : null}
    </div>
  );
}
