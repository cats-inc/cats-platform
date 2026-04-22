import type { CSSProperties, ReactNode } from 'react';

export interface ChatViewFrameProps {
  conversationMode: string;
  layoutMode: string;
  composerVariant: string;
  secondarySurfacePosition: string;
  layoutStyle: CSSProperties;
  hasConversationStarted: boolean;
  topBar: ReactNode;
  statusRow?: ReactNode;
  children: ReactNode;
  sidePanel: ReactNode;
}

export function ChatViewFrame({
  conversationMode,
  layoutMode,
  composerVariant,
  secondarySurfacePosition,
  layoutStyle,
  hasConversationStarted,
  topBar,
  statusRow = null,
  children,
  sidePanel,
}: ChatViewFrameProps) {
  return (
    <>
      <div
        className="viewShell viewShellChannel"
        data-conversation-mode={conversationMode}
        data-layout-mode={layoutMode}
        data-composer-variant={composerVariant}
        data-secondary-surface-position={secondarySurfacePosition}
        style={layoutStyle}
      >
        {topBar}
        {statusRow}
        <div className="channelWorkspace">
          <section className={hasConversationStarted ? 'channelShell' : 'channelShell channelShellFresh'}>
            {children}
          </section>
        </div>
      </div>
      {sidePanel}
    </>
  );
}
