import type { CSSProperties, ReactNode, RefCallback } from 'react';

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
  bottomSentinelRef: RefCallback<HTMLDivElement>;
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
  bottomSentinelRef,
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
            {/* Feedback is now shown via NotificationContainer */}
            {children}
            <div ref={bottomSentinelRef} className="transcriptBottomSentinel" aria-hidden="true" />
          </section>
        </div>
      </div>
      {sidePanel}
    </>
  );
}
