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
import {
  clearPendingRaiseNotice,
  hasPendingRaiseNotice,
  postRaiseNotice,
  stagePendingRaiseNotice,
  subscribeRaiseNotices,
  takePendingRaiseNotice,
} from '../productScopeRaiseNotices.js';

type Translate = (key: MessageKey, values?: MessageInterpolationValues) => string;

export interface ProductScopeRaiseOptions {
  /** The conversation the owner is looking at now. */
  routeChannelId: string | null;
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
  // Locked in the handler: one raise at a time, whatever the buttons show.
  const lockRef = useRef<string | null>(null);
  const routeChannelIdRef = useRef(options.routeChannelId);
  routeChannelIdRef.current = options.routeChannelId;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // Messages from a raise whose app is gone are shown here.
  useEffect(() => subscribeRaiseNotices((message) => showToast(message)), [showToast]);

  /** Here while this app is mounted; otherwise in whichever product app is or comes next. */
  const tell = useCallback((message: string) => {
    if (mountedRef.current) showToast(message); else postRaiseNotice(message);
  }, [showToast]);

  const raise = useCallback(async (channelId: string, target: ProductScope, revision: string): Promise<void> => {
    if (lockRef.current !== null) return;
    lockRef.current = channelId;
    setPendingChannelId(channelId);
    const notice = productScopeRaisedNotice(target, t);
    stagePendingRaiseNotice(channelId, target, notice);
    try {
      await raiseRequest(channelId, target, revision);
      // Not yet handed to a redirect, and the owner is not on the conversation (or this app is
      // gone): say so where they are, and do not pull them back.
      if (hasPendingRaiseNotice(channelId)
        && (!mountedRef.current || routeChannelIdRef.current !== channelId)) {
        clearPendingRaiseNotice(channelId);
        tell(notice);
      }
      if (mountedRef.current) refreshAppShell();
    } catch (error) {
      // Without a code the request may have reached the server: keep the notice for a redirect
      // that may still come.
      if (error instanceof ProductScopeRaiseError && error.code) clearPendingRaiseNotice(channelId);
      tell(describeProductScopeRaiseFailure(error, t));
    } finally {
      lockRef.current = null;
      if (mountedRef.current) setPendingChannelId(null);
    }
  }, [raiseRequest, refreshAppShell, t, tell]);

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
