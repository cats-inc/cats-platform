import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

import { openCatsRuntimeRoot } from '../../shared/catsRuntimeLink.js';

export type AccountIdentityMenuPlacement = 'above' | 'below';
export type AccountIdentityMenuAlignment = 'start' | 'end';
export type AccountIdentityMenuWidth = 'content' | 'trigger';

export interface AccountIdentityMenuProps {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onNavigateSettings: () => void;
  onNavigateEnvironment?: () => void;
  runtimeBaseUrl: string;
  containerClassName?: string;
  triggerClassName: string;
  triggerAriaLabel?: string;
  menuPlacement?: AccountIdentityMenuPlacement;
  menuAlignment?: AccountIdentityMenuAlignment;
  menuWidth?: AccountIdentityMenuWidth;
  rootRef?: RefObject<HTMLDivElement>;
  avatar: ReactNode;
  meta: ReactNode;
  statusIndicator: ReactNode;
}

export function shouldDismissAccountIdentityMenu(
  root: Pick<Node, 'contains'> | null | undefined,
  target: Node | null | undefined,
): boolean {
  return Boolean(root && target && !root.contains(target));
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

export function AccountIdentityMenu({
  open,
  onOpenChange,
  onNavigateSettings,
  onNavigateEnvironment,
  runtimeBaseUrl,
  containerClassName,
  triggerClassName,
  triggerAriaLabel = 'Account menu',
  menuPlacement = 'above',
  menuAlignment = 'start',
  menuWidth = 'content',
  rootRef,
  avatar,
  meta,
  statusIndicator,
}: AccountIdentityMenuProps) {
  const fallbackRootRef = useRef<HTMLDivElement>(null);
  const resolvedRootRef = rootRef ?? fallbackRootRef;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (shouldDismissAccountIdentityMenu(resolvedRootRef.current, event.target as Node | null)) {
        onOpenChange(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open, onOpenChange, resolvedRootRef]);

  function handleToggle(): void {
    onOpenChange(!open);
  }

  function handleSettingsClick(): void {
    onOpenChange(false);
    onNavigateSettings();
  }

  function handleEnvironmentClick(): void {
    onOpenChange(false);
    onNavigateEnvironment?.();
  }

  function handleCatsRuntimeClick(): void {
    onOpenChange(false);
    openCatsRuntimeRoot(runtimeBaseUrl);
  }

  return (
    <div
      className={joinClassNames('accountIdentityMenu', containerClassName)}
      ref={resolvedRootRef}
    >
      <button
        className={triggerClassName}
        type="button"
        onClick={handleToggle}
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {avatar}
        {meta}
        {statusIndicator}
      </button>
      {open ? (
        <div
          className={joinClassNames(
            'accountMenu',
            menuPlacement === 'below' ? 'accountMenu--below' : 'accountMenu--above',
            menuAlignment === 'end' ? 'accountMenu--alignEnd' : 'accountMenu--alignStart',
            menuWidth === 'trigger' ? 'accountMenu--matchTrigger' : undefined,
          )}
          role="menu"
          aria-label="Account menu"
        >
          <button
            className="accountMenuItem"
            type="button"
            role="menuitem"
            onClick={handleSettingsClick}
          >
            Settings
          </button>
          <div className="accountMenuDivider" role="separator" />
          <button
            className="accountMenuItem"
            type="button"
            role="menuitem"
            onClick={handleEnvironmentClick}
          >
            Environment
          </button>
          <button
            className="accountMenuItem"
            type="button"
            role="menuitem"
            onClick={handleCatsRuntimeClick}
          >
            Cats Runtime
          </button>
        </div>
      ) : null}
    </div>
  );
}
