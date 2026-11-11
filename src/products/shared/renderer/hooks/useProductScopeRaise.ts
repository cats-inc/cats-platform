import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ProductScope } from '../../../../shared/productScope.js';
import type { MessageInterpolationValues, MessageKey } from '../../../../shared/i18n/index.js';
import type { ShowToast } from '../../../../design/components/Toast.js';
import { ProductScopeRaiseError, raiseProductScope } from '../api/productScope.js';
import {
  describeProductScopeRaiseFailure,
  productScopeRaisedNotice,
  type ProductScopeRaiseControl,
} from '../productScopeRaise.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import {
  beginRaise,
  clearPendingRaiseNotice,
  endRaise,
  hasPendingRaiseNotice,
  pendingRaiseTarget,
  postRaiseNotice,
  stagePendingRaiseNotice,
  subscribeRaiseNotices,
  takePendingRaiseNotice,
  type RaiseNoticeMessage,
} from '../productScopeRaiseNotices.js';

type Translate = (key: MessageKey, values?: MessageInterpolationValues) => string;

export interface ProductScopeRaiseOptions {
  /** The conversation the owner is looking at now, and the product this app is. */
  routeChannelId: string | null;
  surface: ProductScope;
  refreshAppShell: () => void;
  showToast: ShowToast;
  t: Translate;
  raise?: typeof raiseProductScope;
}

/**
 * SPEC-141 FR-30: the owner's raise from Desktop.
 *
 * The conversation moves by the origin redirect that already follows a scope change. The raise
 * publishes the conversation's update events, the conversation's subscription patches its
 * summary with the new scope, and the redirect opens it under the new product. The raise's
 * response and that update can come in either order, so the toast naming the new product is
 * staged before the request and handed to whichever redirect comes; the new product's app
 * shows it. A refusal shows its reason and the conversation stays.
 *
 * The staged toast and any later message live outside this app (`productScopeRaiseNotices`):
 * the raise may wait on a running turn while the owner goes elsewhere.
 */
export function useProductScopeRaise(options: ProductScopeRaiseOptions): {
  control: ProductScopeRaiseControl;
  takeRedirectNotice: (channelId: string, surface: ProductScope) => string | undefined;
} {
  const { refreshAppShell, showToast, t } = options;
  const raiseRequest = options.raise ?? raiseProductScope;
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  const routeChannelIdRef = useRef(options.routeChannelId);
  routeChannelIdRef.current = options.routeChannelId;
  const surfaceRef = useRef(options.surface);
  surfaceRef.current = options.surface;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  /**
   * A raise's outcome, in the app mounted now. A success about the conversation this app shows,
   * in another product than the one it moved to, is left to that conversation's redirect, which
   * is coming and carries the notice. Anything else is shown here, including a conversation the
   * owner already opened in its new product, where no redirect will come.
   */
  const receive = useCallback((entry: RaiseNoticeMessage) => {
    if (entry.channelId !== null && hasPendingRaiseNotice(entry.channelId)) {
      if (routeChannelIdRef.current === entry.channelId
        && pendingRaiseTarget(entry.channelId) !== surfaceRef.current) return;
      clearPendingRaiseNotice(entry.channelId);
    }
    showToast(entry.message);
  }, [showToast]);
  useEffect(() => subscribeRaiseNotices(receive), [receive]);

  const raise = useCallback(async (channelId: string, target: ProductScope, revision: string): Promise<void> => {
    // One raise at a time across every product app, whatever the buttons show.
    if (!beginRaise(channelId)) {
      showToast(t(messageKeys.sharedProductScopeRaisePending));
      return;
    }
    setPendingChannelId(channelId);
    const notice = productScopeRaisedNotice(target, t);
    stagePendingRaiseNotice(channelId, target, notice);
    try {
      await raiseRequest(channelId, target, revision);
      if (!hasPendingRaiseNotice(channelId)) {
        // A redirect already took the notice.
      } else if (!mountedRef.current) {
        // This app is gone: the app mounted now decides, by what it shows.
        postRaiseNotice({ channelId, message: notice });
      } else if (routeChannelIdRef.current !== channelId) {
        // The owner went elsewhere meanwhile: say so where they are, and do not pull them back.
        clearPendingRaiseNotice(channelId);
        showToast(notice);
      }
      if (mountedRef.current) refreshAppShell();
    } catch (error) {
      const refused = error instanceof ProductScopeRaiseError && Boolean(error.code);
      // Without a refusal the request may have reached the server. If a redirect already took the
      // notice, the conversation moved and the owner was told.
      if (!refused && !hasPendingRaiseNotice(channelId)) return;
      // A refusal clears the notice. Without one, it stays for a redirect that may still come.
      if (refused) clearPendingRaiseNotice(channelId);
      const message = describeProductScopeRaiseFailure(error, t);
      if (mountedRef.current) showToast(message); else postRaiseNotice({ channelId: null, message });
    } finally {
      endRaise(channelId);
      if (mountedRef.current) setPendingChannelId(null);
    }
  }, [raiseRequest, refreshAppShell, showToast, t]);

  const report = useCallback((message: string) => showToast(message), [showToast]);

  const takeRedirectNotice = useCallback(
    (channelId: string, surface: ProductScope) => takePendingRaiseNotice(channelId, surface),
    [],
  );

  const control = useMemo<ProductScopeRaiseControl>(
    () => ({ pendingChannelId, raise, report }),
    [pendingChannelId, raise, report],
  );
  return { control, takeRedirectNotice };
}
