import type { CSSProperties, MouseEventHandler, MutableRefObject, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function SidebarFloatingMenuPortal({
  className,
  menuRef,
  style,
  onClick,
  children,
}: {
  className: string;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  const content = (
    <div
      ref={menuRef}
      className={className}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );

  if (typeof document === 'undefined') {
    return content;
  }

  return createPortal(content, document.body);
}
