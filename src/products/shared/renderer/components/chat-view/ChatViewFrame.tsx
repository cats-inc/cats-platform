import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { readCatCover, subscribeCatCover } from '../../catCoverStorage.js';

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
  activeDirectCatId?: string | null;
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
  activeDirectCatId = null,
}: ChatViewFrameProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!activeDirectCatId) {
      setCoverUrl(null);
      return;
    }
    setCoverUrl(readCatCover(activeDirectCatId));
    return subscribeCatCover(activeDirectCatId, setCoverUrl);
  }, [activeDirectCatId]);

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
          {coverUrl ? (
            <div
              className="activeChatCoverBackdrop"
              style={{ backgroundImage: `url(${coverUrl})` }}
              aria-hidden="true"
            />
          ) : null}
          <section className={hasConversationStarted ? 'channelShell' : 'channelShell channelShellFresh'}>
            {children}
          </section>
        </div>
      </div>
      {sidePanel}
    </>
  );
}
