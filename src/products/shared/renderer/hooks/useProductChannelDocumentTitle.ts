import { useEffect } from 'react';

import { presentChannelTitle } from '../workspaceChatUtils.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

export function useProductChannelDocumentTitle(
  appTitle: string,
  routeChannelTitle: string | null,
): void {
  const { t } = useI18n();
  useEffect(() => {
    document.title = routeChannelTitle
      ? `${presentChannelTitle(routeChannelTitle, t)} - ${appTitle}`
      : appTitle;
  }, [appTitle, routeChannelTitle, t]);
}
