import { useEffect } from 'react';

import { presentChannelTitle } from '../workspaceChatUtils.js';

export function useProductChannelDocumentTitle(
  appTitle: string,
  routeChannelTitle: string | null,
): void {
  useEffect(() => {
    document.title = routeChannelTitle
      ? `${presentChannelTitle(routeChannelTitle)} - ${appTitle}`
      : appTitle;
  }, [appTitle, routeChannelTitle]);
}
